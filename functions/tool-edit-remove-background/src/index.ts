import { getKnownConfig } from '@image-workshop/aws-config';
import { editRemoveBackground } from '@image-workshop/mcp-tools';
import {
  callStabilityApi,
  createImageBlobAsync,
  toToolResponse,
} from '@image-workshop/stability-api';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for edit/remove-background
 */
export interface EditRemoveBackgroundRequest {
  image: string;
  output_format?: 'png' | 'webp';
}

/**
 * MCP Tool Input Schema
 */
export const toolSchema = editRemoveBackground;

/**
 * Parse and validate request body
 */
function parseRequest(body: string | null): EditRemoveBackgroundRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.image || typeof parsed.image !== 'string') {
    throw new Error('image is required and must be a string');
  }

  // Only png and webp support transparency
  const format = parsed.output_format ?? 'png';
  if (format !== 'png' && format !== 'webp') {
    throw new Error('output_format must be "png" or "webp" for transparency support');
  }

  return {
    image: parsed.image,
    output_format: format,
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

    console.log('Calling Stability AI edit/remove-background...');

    // Support both base64 and URL inputs
    const imageBlob = await createImageBlobAsync(request.image, 'image.png');

    const response = await callStabilityApi(
      '/v2beta/stable-image/edit/remove-background',
      apiKey,
      {
        output_format: request.output_format,
      },
      {
        image: imageBlob,
      },
      request.output_format
    );

    console.log('Remove-background complete.');

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
