import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler, mcpToolSchema } from './index';

// Mock the aws-config module
vi.mock('@image-workshop/aws-config', () => ({
  getKnownConfig: vi.fn().mockResolvedValue('test-api-key'),
  getValue: vi.fn().mockResolvedValue('stable-diffusion-xl-1024-v1-0'),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('tool-txt2img-stable-diffusion', () => {
  const mockContext: Context = {
    awsRequestId: 'test-request-id',
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:test',
    memoryLimitInMB: '512',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2024/01/01/[$LATEST]test',
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler', () => {
    it('should handle OPTIONS request for CORS', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'OPTIONS',
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
    });

    it('should return 400 if body is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty('error');
    });

    it('should return 400 if prompt is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({}),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('prompt is required');
    });

    it('should return 400 if width is invalid', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          prompt: 'a test image',
          width: 1000, // Not a multiple of 64
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('width must be');
    });

    it('should successfully generate an image', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artifacts: [
            {
              base64: 'dGVzdC1pbWFnZS1kYXRh', // "test-image-data" in base64
              seed: 12345,
              finishReason: 'SUCCESS',
            },
          ],
        }),
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          prompt: 'a beautiful sunset over mountains',
          width: 1024,
          height: 1024,
          steps: 30,
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.image).toBe('dGVzdC1pbWFnZS1kYXRh');
      expect(body.seed).toBe(12345);
      expect(body.finish_reason).toBe('SUCCESS');
    });

    it('should handle Stability API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          prompt: 'a test image',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(502);
      expect(JSON.parse(result.body).error).toContain('API error');
    });
  });

  describe('mcpToolSchema', () => {
    it('should have correct tool name', () => {
      expect(mcpToolSchema.name).toBe('txt2img_stable_diffusion');
    });

    it('should have description', () => {
      expect(mcpToolSchema.description).toBeTruthy();
      expect(mcpToolSchema.description).toContain('Stable Diffusion');
    });

    it('should require prompt', () => {
      expect(mcpToolSchema.inputSchema.required).toContain('prompt');
    });

    it('should have valid input schema properties', () => {
      const props = mcpToolSchema.inputSchema.properties;
      expect(props.prompt).toBeDefined();
      expect(props.negative_prompt).toBeDefined();
      expect(props.width).toBeDefined();
      expect(props.height).toBeDefined();
      expect(props.steps).toBeDefined();
      expect(props.cfg_scale).toBeDefined();
      expect(props.seed).toBeDefined();
      expect(props.style_preset).toBeDefined();
    });

    it('should have style_preset enum with valid values', () => {
      const stylePreset = mcpToolSchema.inputSchema.properties.style_preset;
      expect(stylePreset.enum).toBeDefined();
      expect(stylePreset.enum).toContain('photographic');
      expect(stylePreset.enum).toContain('anime');
      expect(stylePreset.enum).toContain('digital-art');
    });
  });
});

