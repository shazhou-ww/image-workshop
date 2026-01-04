import { getKnownConfig } from '@image-workshop/aws-config';
import { editSearchAndRecolor } from '@image-workshop/mcp-tools';
import {
  callStabilityApi,
  createImageBlobAsync,
  toToolResponse,
} from '@image-workshop/stability-api';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for edit/search-and-recolor
 */
export interface EditSearchAndRecolorRequest {
  image: string;
  prompt: string;
  select_prompt: string;
  negative_prompt?: string;
  grow_mask?: number;
  seed?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
}

/**
 * MCP Tool Input Schema
 */
export const toolSchema = editSearchAndRecolor;

/**
 * Parse and validate request body
 */
function parseRequest(body: string | null): EditSearchAndRecolorRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.image || typeof parsed.image !== 'string') {
    throw new Error('image is required and must be a string');
  }

  if (!parsed.prompt || typeof parsed.prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }

  if (!parsed.select_prompt || typeof parsed.select_prompt !== 'string') {
    throw new Error('select_prompt is required and must be a string');
  }

  return {
    image: parsed.image,
    prompt: parsed.prompt.trim(),
    select_prompt: parsed.select_prompt.trim(),
    negative_prompt: parsed.negative_prompt?.trim(),
    grow_mask: parsed.grow_mask ?? 3,
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

    console.log('Calling Stability AI edit/search-and-recolor...');
    console.log(`Select: "${request.select_prompt}" → Color: "${request.prompt}"`);

    // Support both base64 and URL inputs
    const imageBlob = await createImageBlobAsync(request.image, 'image.png');

    const response = await callStabilityApi(
      '/v2beta/stable-image/edit/search-and-recolor',
      apiKey,
      {
        prompt: request.prompt,
        select_prompt: request.select_prompt,
        negative_prompt: request.negative_prompt,
        grow_mask: request.grow_mask,
        seed: request.seed,
        output_format: request.output_format,
      },
      {
        image: imageBlob,
      },
      request.output_format
    );

    console.log(`Search-and-recolor complete. Seed: ${response.seed}`);

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
