import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { getValue } from '@image-workshop/aws-config';
import {
  type McpToolConfig,
  type McpToolDefinition,
  TOOL_REGISTRY,
} from '@image-workshop/mcp-tools';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

// ============================================================================
// MCP Protocol Types (JSON-RPC 2.0 based)
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpServerInfo {
  name: string;
  version: string;
}

interface McpCapabilities {
  tools?: Record<string, never>;
  resources?: Record<string, never>;
  prompts?: Record<string, never>;
}

// ============================================================================
// MCP Server Implementation
// ============================================================================

const SERVER_INFO: McpServerInfo = {
  name: 'image-workshop-mcp',
  version: '1.0.0',
};

const SERVER_CAPABILITIES: McpCapabilities = {
  tools: {},
};

// Lambda client for invoking tool functions
let lambdaClient: LambdaClient | null = null;

function getLambdaClient(region: string): LambdaClient {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region });
  }
  return lambdaClient;
}

/**
 * Handle initialize request
 */
function handleInitialize(): {
  protocolVersion: string;
  capabilities: McpCapabilities;
  serverInfo: McpServerInfo;
} {
  return {
    protocolVersion: '2025-06-18',
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
}

/**
 * Handle tools/list request
 */
function handleToolsList(): { tools: McpToolDefinition[] } {
  const tools: McpToolDefinition[] = TOOL_REGISTRY.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  return { tools };
}

/**
 * Invoke tool via HTTP (for local SAM development)
 */
async function invokeToolViaHttp(
  tool: McpToolConfig,
  args: Record<string, unknown>,
  baseUrl: string
): Promise<unknown> {
  const url = `${baseUrl}${tool.apiPath}`;
  console.log(`Invoking tool via HTTP: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new McpError(-32603, (result as { error?: string }).error || `HTTP ${response.status}`);
  }

  return result;
}

/**
 * Invoke tool via Lambda (for production)
 */
async function invokeToolViaLambda(
  tool: McpToolConfig,
  args: Record<string, unknown>,
  region: string
): Promise<unknown> {
  // Get the actual Lambda function name from environment or config
  const functionName = await getValue(`LAMBDA_${tool.lambdaFunction.toUpperCase()}`, {
    parameterId: `/image-workshop/lambda/${tool.lambdaFunction}`,
    defaultValue: tool.lambdaFunction,
  });

  console.log(`Invoking tool via Lambda: ${functionName}`);

  // Create the API Gateway-like event for the tool Lambda
  const toolEvent = {
    httpMethod: 'POST',
    body: JSON.stringify(args),
    headers: {
      'Content-Type': 'application/json',
    },
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {},
  };

  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: JSON.stringify(toolEvent),
  });

  const client = getLambdaClient(region);
  const response = await client.send(command);

  if (response.FunctionError) {
    const errorPayload = response.Payload
      ? new TextDecoder().decode(response.Payload)
      : 'Unknown error';
    console.error(`Lambda error: ${errorPayload}`);
    throw new McpError(-32603, `Tool execution failed: ${errorPayload}`);
  }

  if (!response.Payload) {
    throw new McpError(-32603, 'Empty response from tool Lambda');
  }

  // Parse the Lambda response (API Gateway format)
  const lambdaResponse = JSON.parse(new TextDecoder().decode(response.Payload));
  const toolResult = JSON.parse(lambdaResponse.body || '{}');

  // Check if the tool returned an error
  if (lambdaResponse.statusCode >= 400) {
    throw new McpError(-32603, toolResult.error || 'Tool execution failed');
  }

  return toolResult;
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(
  params: { name: string; arguments?: Record<string, unknown> },
  region: string
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const tool = TOOL_REGISTRY.find((t) => t.name === params.name);

  if (!tool) {
    throw new McpError(-32602, `Unknown tool: ${params.name}`);
  }

  console.log(`Invoking tool: ${tool.name} -> Lambda: ${tool.lambdaFunction}`);

  try {
    // Check if running in local development mode
    // LOCAL_API_BASE_URL should be set to SAM local URL, e.g., "http://host.docker.internal:3000"
    const localBaseUrl = process.env.LOCAL_API_BASE_URL;

    let toolResult: unknown;

    if (localBaseUrl) {
      // Local development: call via HTTP
      toolResult = await invokeToolViaHttp(tool, params.arguments || {}, localBaseUrl);
    } else {
      // Production: call via Lambda invoke
      toolResult = await invokeToolViaLambda(tool, params.arguments || {}, region);
    }

    // Format response for MCP
    const result = toolResult as Record<string, unknown>;

    // If the result contains an image, return it as an image content
    if (result.image && result.mime_type) {
      return {
        content: [
          {
            type: 'image',
            data: result.image as string,
            mimeType: result.mime_type as string,
          },
          {
            type: 'text',
            text: JSON.stringify(
              {
                seed: result.seed,
                finish_reason: result.finish_reason,
                model: result.model,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Default: return as text
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(toolResult, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    console.error(`Tool invocation error:`, error);
    throw new McpError(
      -32603,
      `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// MCP Error
// ============================================================================

class McpError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'McpError';
  }
}

// ============================================================================
// Request Handler
// ============================================================================

/**
 * Route MCP requests to appropriate handlers
 */
async function handleMcpRequest(request: JsonRpcRequest, region: string): Promise<JsonRpcResponse> {
  console.log(`MCP Request: ${request.method}`, JSON.stringify(request.params || {}));

  try {
    let result: unknown;

    switch (request.method) {
      case 'initialize':
        result = handleInitialize();
        break;

      case 'initialized':
      case 'notifications/initialized':
        // Client acknowledgment notification, no response needed
        result = {};
        break;

      case 'tools/list':
        result = handleToolsList();
        break;

      case 'tools/call':
        if (!request.params?.name || typeof request.params.name !== 'string') {
          throw new McpError(-32602, 'Missing or invalid tool name');
        }
        result = await handleToolsCall(
          request.params as { name: string; arguments?: Record<string, unknown> },
          region
        );
        break;

      case 'resources/list':
        // No resources implemented yet
        result = { resources: [] };
        break;

      case 'prompts/list':
        // No prompts implemented yet
        result = { prompts: [] };
        break;

      case 'ping':
        result = {};
        break;

      default:
        throw new McpError(-32601, `Method not found: ${request.method}`);
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    };
  } catch (error) {
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(-32603, error instanceof Error ? error.message : 'Internal error');

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: mcpError.code,
        message: mcpError.message,
        data: mcpError.data,
      },
    };
  }
}

// ============================================================================
// Lambda Handler
// ============================================================================

/**
 * Lambda handler for MCP server
 * Supports both Lambda Function URL and API Gateway
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('RequestId:', context.awsRequestId);

  // CORS headers
  const headers: Record<string, string> = {
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

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Method not allowed. Use POST.',
        },
      }),
    };
  }

  try {
    if (!event.body) {
      throw new McpError(-32600, 'Empty request body');
    }

    const request: JsonRpcRequest = JSON.parse(event.body);

    // Validate JSON-RPC format
    if (request.jsonrpc !== '2.0') {
      throw new McpError(-32600, 'Invalid JSON-RPC version');
    }

    if (!request.method || typeof request.method !== 'string') {
      throw new McpError(-32600, 'Missing or invalid method');
    }

    // Get AWS region
    const region = process.env.AWS_REGION || 'us-east-1';

    // Handle the request
    const response = await handleMcpRequest(request, region);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error:', error);

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error: Invalid JSON',
          },
        }),
      };
    }

    // Handle MCP errors
    if (error instanceof McpError) {
      return {
        statusCode: 200, // MCP errors are returned as 200 with error in body
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: error.code,
            message: error.message,
            data: error.data,
          },
        }),
      };
    }

    // Unknown errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
      }),
    };
  }
};

/**
 * Export tool registry for external use
 */
export { TOOL_REGISTRY, SERVER_INFO };
