/**
 * MCP Tool Definition
 * Represents the schema of a tool as defined by the MCP protocol
 */
export interface McpToolDefinition {
  /** Unique tool name (snake_case) */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema for tool input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Tool Configuration
 * Extends McpToolDefinition with deployment-specific configuration
 */
export interface McpToolConfig extends McpToolDefinition {
  /** Lambda function name (CloudFormation resource name) */
  lambdaFunction: string;
  /** API Gateway path for local development */
  apiPath: string;
}

/**
 * MCP Content types for tool responses
 */
export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type McpContent = McpTextContent | McpImageContent;

/**
 * MCP Tool Response
 */
export interface McpToolResponse {
  content: McpContent[];
}
