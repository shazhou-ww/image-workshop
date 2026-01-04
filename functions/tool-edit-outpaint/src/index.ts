import { getKnownConfig } from '@image-workshop/aws-config';
import { editOutpaint } from '@image-workshop/mcp-tools';
import {
  callStabilityApi,
  createImageBlobAsync,
  toToolResponse,
} from '@image-workshop/stability-api';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for edit/outpaint
 */
export interface EditOutpaintRequest {
  image: string;
  prompt?: string;
  left?: number;
  right?: number;
  up?: number;
  down?: number;
  creativity?: number;
  seed?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
}

/**
 * MCP Tool Input Schema
 */
export const toolSchema = editOutpaint;

/**
 * Parse and validate request body
 */
function parseRequest(body: string | null): EditOutpaintRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.image || typeof parsed.image !== 'string') {
    throw new Error('image is required and must be a string');
  }

  // At least one direction must be specified
  const left = parsed.left ?? 0;
  const right = parsed.right ?? 0;
  const up = parsed.up ?? 0;
  const down = parsed.down ?? 0;

  if (left === 0 && right === 0 && up === 0 && down === 0) {
    throw new Error('At least one direction (left, right, up, down) must be greater than 0');
  }

  return {
    image: parsed.image,
    prompt: parsed.prompt?.trim(),
    left,
    right,
    up,
    down,
    creativity: parsed.creativity ?? 0.5,
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

    console.log('Calling Stability AI edit/outpaint...');
    console.log(`Extend: L=${request.left} R=${request.right} U=${request.up} D=${request.down}`);

    // Support both base64 and URL inputs
    const imageBlob = await createImageBlobAsync(request.image, 'image.png');

    const response = await callStabilityApi(
      '/v2beta/stable-image/edit/outpaint',
      apiKey,
      {
        prompt: request.prompt,
        left: request.left,
        right: request.right,
        up: request.up,
        down: request.down,
        creativity: request.creativity,
        seed: request.seed,
        output_format: request.output_format,
      },
      {
        image: imageBlob,
      },
      request.output_format
    );

    console.log(`Outpaint complete. Seed: ${response.seed}`);

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
