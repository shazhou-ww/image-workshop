import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { getKnownConfig, getValue } from '@image-workshop/aws-config';
import { txt2imgStableDiffusion } from '@image-workshop/mcp-tools';

/**
 * Request body for txt2img generation
 * Compatible with MCP tool schema
 */
export interface Txt2ImgRequest {
  /** The prompt describing what to generate */
  prompt: string;
  /** Negative prompt - what to avoid in the image */
  negative_prompt?: string;
  /** Image width (default: 1024) */
  width?: number;
  /** Image height (default: 1024) */
  height?: number;
  /** Number of diffusion steps (default: 30) */
  steps?: number;
  /** Classifier-free guidance scale (default: 7.0) */
  cfg_scale?: number;
  /** Random seed for reproducibility (optional) */
  seed?: number;
  /** Style preset (optional, e.g., "photographic", "anime", "digital-art") */
  style_preset?: string;
  /** Output format: "png" | "jpeg" | "webp" (default: "png") */
  output_format?: 'png' | 'jpeg' | 'webp';
}

/**
 * Response from txt2img generation
 */
export interface Txt2ImgResponse {
  /** Base64 encoded image data */
  image: string;
  /** MIME type of the image */
  mime_type: string;
  /** Seed used for generation (for reproducibility) */
  seed: number;
  /** Generation finish reason */
  finish_reason: 'SUCCESS' | 'CONTENT_FILTERED' | 'ERROR';
  /** Model used for generation */
  model: string;
}

/**
 * MCP Tool Input Schema
 * Re-exported from shared package for use by MCP server
 */
export const toolSchema = txt2imgStableDiffusion;

/**
 * Stability AI API response
 */
interface StabilityResponse {
  artifacts: Array<{
    base64: string;
    seed: number;
    finishReason: 'SUCCESS' | 'CONTENT_FILTERED' | 'ERROR';
  }>;
}

/**
 * Parse and validate request body
 */
function parseRequest(body: string | null): Txt2ImgRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.prompt || typeof parsed.prompt !== 'string' || parsed.prompt.trim() === '') {
    throw new Error('prompt is required and must be a non-empty string');
  }

  // Validate dimensions (must be multiples of 64)
  if (parsed.width !== undefined) {
    if (typeof parsed.width !== 'number' || parsed.width < 512 || parsed.width > 2048 || parsed.width % 64 !== 0) {
      throw new Error('width must be a number between 512 and 2048, and a multiple of 64');
    }
  }

  if (parsed.height !== undefined) {
    if (typeof parsed.height !== 'number' || parsed.height < 512 || parsed.height > 2048 || parsed.height % 64 !== 0) {
      throw new Error('height must be a number between 512 and 2048, and a multiple of 64');
    }
  }

  // Validate steps
  if (parsed.steps !== undefined) {
    if (typeof parsed.steps !== 'number' || parsed.steps < 10 || parsed.steps > 50) {
      throw new Error('steps must be a number between 10 and 50');
    }
  }

  // Validate cfg_scale
  if (parsed.cfg_scale !== undefined) {
    if (typeof parsed.cfg_scale !== 'number' || parsed.cfg_scale < 1 || parsed.cfg_scale > 35) {
      throw new Error('cfg_scale must be a number between 1 and 35');
    }
  }

  return {
    prompt: parsed.prompt.trim(),
    negative_prompt: parsed.negative_prompt?.trim(),
    width: parsed.width ?? 1024,
    height: parsed.height ?? 1024,
    steps: parsed.steps ?? 30,
    cfg_scale: parsed.cfg_scale ?? 7.0,
    seed: parsed.seed,
    style_preset: parsed.style_preset,
    output_format: parsed.output_format ?? 'png',
  };
}

/**
 * Call Stability AI API for text-to-image generation
 */
async function generateImage(
  request: Txt2ImgRequest,
  apiKey: string,
  model: string
): Promise<Txt2ImgResponse> {
  const apiHost = 'https://api.stability.ai';
  const endpoint = `/v1/generation/${model}/text-to-image`;

  console.log(`Calling Stability AI API: ${endpoint}`);
  console.log(`Prompt: ${request.prompt.substring(0, 100)}...`);
  console.log(`Dimensions: ${request.width}x${request.height}, Steps: ${request.steps}`);

  const payload: Record<string, unknown> = {
    text_prompts: [
      {
        text: request.prompt,
        weight: 1.0,
      },
    ],
    cfg_scale: request.cfg_scale,
    height: request.height,
    width: request.width,
    steps: request.steps,
    samples: 1,
  };

  // Add negative prompt if provided
  if (request.negative_prompt) {
    (payload.text_prompts as Array<{ text: string; weight: number }>).push({
      text: request.negative_prompt,
      weight: -1.0,
    });
  }

  // Add optional parameters
  if (request.seed !== undefined) {
    payload.seed = request.seed;
  }

  if (request.style_preset) {
    payload.style_preset = request.style_preset;
  }

  const response = await fetch(`${apiHost}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Stability API Error: ${response.status} - ${errorText}`);
    throw new Error(`Stability AI API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as StabilityResponse;

  if (!result.artifacts || result.artifacts.length === 0) {
    throw new Error('No image generated');
  }

  const artifact = result.artifacts[0];

  return {
    image: artifact.base64,
    mime_type: `image/${request.output_format}`,
    seed: artifact.seed,
    finish_reason: artifact.finishReason,
    model,
  };
}

/**
 * Lambda handler for txt2img generation
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('RequestId:', context.awsRequestId);

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    // Parse request
    const request = parseRequest(event.body);

    // Get API key from config (ENV -> Secrets Manager)
    const apiKey = await getKnownConfig('STABILITY_API_KEY', { required: true });

    // Get model from config (defaults to SDXL 1.0)
    const model = await getValue('STABILITY_MODEL', {
      parameterId: '/image-workshop/stability/model',
      defaultValue: 'stable-diffusion-xl-1024-v1-0',
    });

    console.log(`Using model: ${model}`);

    // Generate image
    const result = await generateImage(request, apiKey, model);

    console.log(`Generation complete. Seed: ${result.seed}, Finish reason: ${result.finish_reason}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = message.includes('required') || message.includes('must be') ? 400 : 
                       message.includes('API error') ? 502 : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: message,
        requestId: context.awsRequestId,
      }),
    };
  }
};

/**
 * Export the tool schema for MCP server registration
 */
export { toolSchema as mcpToolSchema };

