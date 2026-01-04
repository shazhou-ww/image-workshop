/**
 * MCP Tools Package
 *
 * Shared definitions for MCP tools used by:
 * - image-workshop-mcp (router): imports TOOL_REGISTRY for routing
 * - tool-* (Lambda functions): imports individual tool schemas
 */

// Registry
export { getToolByName, getToolDefinitions, TOOL_REGISTRY } from './registry';
// Individual tool definitions (for tool Lambda functions)
export {
  // Control Tools
  controlSketch,
  controlStructure,
  controlStyle,
  // Edit Tools
  editErase,
  editInpaint,
  editOutpaint,
  editRemoveBackground,
  editSearchAndRecolor,
  editSearchAndReplace,
  // Style Transfer
  styleTransfer,
  // Text-to-Image
  txt2imgStableDiffusion,
} from './tools';
// Types
export type {
  McpContent,
  McpImageContent,
  McpTextContent,
  McpToolConfig,
  McpToolDefinition,
  McpToolResponse,
} from './types';
