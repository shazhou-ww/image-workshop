import { getKnownConfig } from '@image-workshop/aws-config';
import { styleTransfer } from '@image-workshop/mcp-tools';
import {
  callStabilityApi,
  createImageBlobAsync,
  toToolResponse,
} from '@image-workshop/stability-api';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for style-transfer (uses control/style endpoint with style_image)
 */
export interface StyleTransferRequest {
  image: string;
  style_image: string;
  prompt?: string;
  negative_prompt?: string;
  fidelity?: number;
  seed?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
}

/**
 * MCP Tool Input Schema
 */
export const toolSchema = styleTransfer;

/**
 * Parse and validate request body
 */
function parseRequest(body: string | null): StyleTransferRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.image || typeof parsed.image !== 'string') {
    throw new Error('image is required and must be a string');
  }

  if (!parsed.style_image || typeof parsed.style_image !== 'string') {
    throw new Error('style_image is required and must be a string');
  }

  return {
    image: parsed.image,
    style_image: parsed.style_image,
    prompt: parsed.prompt?.trim(),
    negative_prompt: parsed.negative_prompt?.trim(),
    fidelity: parsed.fidelity ?? 0.5,
    seed: parsed.seed,
    output_format: parsed.output_format ?? 'png',
  };
}

/**
 * Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('RequestId:', context.awsRequestId);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      body: '',
    };
  }

  try {
    const request = parseRequest(event.body);
    const apiKey = await getKnownConfig('STABILITY_API_KEY', { required: true });

    console.log('Calling Stability AI style-transfer...');
    if (request.prompt) {
      console.log(`Prompt: ${request.prompt.substring(0, 100)}...`);
    }

    // Support both base64 and URL inputs
    const [imageBlob, styleImageBlob] = await Promise.all([
      createImageBlobAsync(request.image, 'content.png'),
      createImageBlobAsync(request.style_image, 'style.png'),
    ]);

    // Style transfer uses the control/style endpoint with both image and style_image
    const response = await callStabilityApi(
      '/v2beta/stable-image/control/style',
      apiKey,
      {
        prompt: request.prompt || 'transfer the style',
        negative_prompt: request.negative_prompt,
        fidelity: request.fidelity,
        seed: request.seed,
        output_format: request.output_format,
      },
      {
        image: imageBlob,
        style_image: styleImageBlob,
      },
      request.output_format
    );

    console.log(`Style transfer complete. Seed: ${response.seed}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(toToolResponse(response)),
    };
  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode =
      message.includes('required') || message.includes('must be')
        ? 400
        : message.includes('API error')
          ? 502
          : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: message, requestId: context.awsRequestId }),
    };
  }
};

export { toolSchema as mcpToolSchema };
