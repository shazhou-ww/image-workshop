import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler, TOOL_REGISTRY, SERVER_INFO } from './index';

// Mock the aws-config module
vi.mock('@image-workshop/aws-config', () => ({
  getValue: vi.fn().mockResolvedValue('mock-function-name'),
}));

// Mock Lambda client
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  InvokeCommand: vi.fn(),
}));

describe('image-workshop-mcp', () => {
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

    it('should reject non-POST methods', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Method not allowed');
    });

    it('should handle invalid JSON', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: 'not valid json',
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(-32700);
      expect(body.error.message).toContain('Parse error');
    });

    it('should handle empty request body', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(-32600);
    });

    it('should handle invalid JSON-RPC version', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: 1,
          method: 'initialize',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(-32600);
      expect(body.error.message).toContain('Invalid JSON-RPC version');
    });
  });

  describe('initialize', () => {
    it('should return server info and capabilities', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result.serverInfo.name).toBe('image-workshop-mcp');
      expect(body.result.capabilities).toHaveProperty('tools');
    });
  });

  describe('tools/list', () => {
    it('should return available tools', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.result.tools).toBeDefined();
      expect(Array.isArray(body.result.tools)).toBe(true);
      expect(body.result.tools.length).toBeGreaterThan(0);

      // Check that txt2img tool is present
      const txt2imgTool = body.result.tools.find(
        (t: { name: string }) => t.name === 'txt2img_stable_diffusion'
      );
      expect(txt2imgTool).toBeDefined();
      expect(txt2imgTool.inputSchema.required).toContain('prompt');
    });
  });

  describe('resources/list', () => {
    it('should return empty resources list', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'resources/list',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.result.resources).toEqual([]);
    });
  });

  describe('prompts/list', () => {
    it('should return empty prompts list', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'prompts/list',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.result.prompts).toEqual([]);
    });
  });

  describe('ping', () => {
    it('should respond to ping', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'ping',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.result).toEqual({});
    });
  });

  describe('unknown method', () => {
    it('should return method not found error', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'unknown/method',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('Method not found');
    });
  });

  describe('TOOL_REGISTRY', () => {
    it('should have txt2img_stable_diffusion registered', () => {
      const tool = TOOL_REGISTRY.find((t) => t.name === 'txt2img_stable_diffusion');
      expect(tool).toBeDefined();
      expect(tool?.lambdaFunction).toBe('ToolTxt2imgStableDiffusionFunction');
    });
  });

  describe('SERVER_INFO', () => {
    it('should have correct server name', () => {
      expect(SERVER_INFO.name).toBe('image-workshop-mcp');
    });

    it('should have version', () => {
      expect(SERVER_INFO.version).toBeDefined();
    });
  });
});

