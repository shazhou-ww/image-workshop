/**
 * MCP Tools Package
 *
 * Shared definitions for MCP tools used by:
 * - image-workshop-mcp (router): imports TOOL_REGISTRY for routing
 * - tool-* (Lambda functions): imports individual tool schemas
 */

// Types
export type {
  McpToolDefinition,
  McpToolConfig,
  McpTextContent,
  McpImageContent,
  McpContent,
  McpToolResponse,
} from './types';

// Registry
export { TOOL_REGISTRY, getToolByName, getToolDefinitions } from './registry';

// Individual tool definitions (for tool Lambda functions)
export { txt2imgStableDiffusion } from './tools';

