import {
  controlSketch,
  controlStructure,
  controlStyle,
  editErase,
  editInpaint,
  editOutpaint,
  editRemoveBackground,
  editSearchAndRecolor,
  editSearchAndReplace,
  styleTransfer,
  txt2imgStableDiffusion,
} from './tools';
import type { McpToolConfig } from './types';

/**
 * Tool Registry
 *
 * Central registry of all MCP tools with their deployment configuration.
 * The router imports this registry to:
 * 1. Respond to tools/list requests
 * 2. Route tools/call requests to the correct Lambda function
 *
 * To add a new tool:
 * 1. Create the tool definition in src/tools/
 * 2. Export it from src/tools/index.ts
 * 3. Add an entry to this registry with the Lambda and API path
 */
export const TOOL_REGISTRY: McpToolConfig[] = [
  // Text-to-Image
  {
    ...txt2imgStableDiffusion,
    lambdaFunction: 'ToolTxt2imgStableDiffusionFunction',
    apiPath: '/tools/txt2img-stable-diffusion',
  },
  // Edit Tools
  {
    ...editErase,
    lambdaFunction: 'ToolEditEraseFunction',
    apiPath: '/tools/edit-erase',
  },
  {
    ...editInpaint,
    lambdaFunction: 'ToolEditInpaintFunction',
    apiPath: '/tools/edit-inpaint',
  },
  {
    ...editOutpaint,
    lambdaFunction: 'ToolEditOutpaintFunction',
    apiPath: '/tools/edit-outpaint',
  },
  {
    ...editSearchAndReplace,
    lambdaFunction: 'ToolEditSearchAndReplaceFunction',
    apiPath: '/tools/edit-search-and-replace',
  },
  {
    ...editSearchAndRecolor,
    lambdaFunction: 'ToolEditSearchAndRecolorFunction',
    apiPath: '/tools/edit-search-and-recolor',
  },
  {
    ...editRemoveBackground,
    lambdaFunction: 'ToolEditRemoveBackgroundFunction',
    apiPath: '/tools/edit-remove-background',
  },
  // Control Tools
  {
    ...controlSketch,
    lambdaFunction: 'ToolControlSketchFunction',
    apiPath: '/tools/control-sketch',
  },
  {
    ...controlStructure,
    lambdaFunction: 'ToolControlStructureFunction',
    apiPath: '/tools/control-structure',
  },
  {
    ...controlStyle,
    lambdaFunction: 'ToolControlStyleFunction',
    apiPath: '/tools/control-style',
  },
  // Style Transfer
  {
    ...styleTransfer,
    lambdaFunction: 'ToolStyleTransferFunction',
    apiPath: '/tools/style-transfer',
  },
];

/**
 * Get a tool config by name
 */
export function getToolByName(name: string): McpToolConfig | undefined {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}

/**
 * Get all tool definitions (without deployment config)
 * Used for tools/list response
 */
export function getToolDefinitions() {
  return TOOL_REGISTRY.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}
