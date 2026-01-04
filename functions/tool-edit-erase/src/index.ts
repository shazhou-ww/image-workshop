import { getKnownConfig } from '@image-workshop/aws-config';
import { editErase } from '@image-workshop/mcp-tools';
import {
  callStabilityApi,
  createImageBlobAsync,
  toToolResponse,
} from '@image-workshop/stability-api';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for edit/erase
 */
export interface EditEraseRequest {
  image: string;
  mask: string;
  grow_mask?: number;
  seed?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
}

/**
 * MCP Tool Input Schema
 */
export const toolSchema = editErase;

/**
 * Parse and validate request body
 */
function parseRequest(body: string | null): EditEraseRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.image || typeof parsed.image !== 'string') {
    throw new Error('image is required and must be a string');
  }

  if (!parsed.mask || typeof parsed.mask !== 'string') {
    throw new Error('mask is required and must be a string');
  }

  return {
    image: parsed.image,
    mask: parsed.mask,
    grow_mask: parsed.grow_mask ?? 5,
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

    console.log('Calling Stability AI edit/erase...');

    // Support both base64 and URL inputs
    const [imageBlob, maskBlob] = await Promise.all([
      createImageBlobAsync(request.image, 'image.png'),
      createImageBlobAsync(request.mask, 'mask.png'),
    ]);

    const response = await callStabilityApi(
      '/v2beta/stable-image/edit/erase',
      apiKey,
      {
        grow_mask: request.grow_mask,
        seed: request.seed,
        output_format: request.output_format,
      },
      {
        image: imageBlob,
        mask: maskBlob,
      },
      request.output_format
    );

    console.log(`Erase complete. Seed: ${response.seed}`);

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
