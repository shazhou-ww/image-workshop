import type { McpToolConfig } from './types';
import { txt2imgStableDiffusion } from './tools';

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
  {
    ...txt2imgStableDiffusion,
    lambdaFunction: 'ToolTxt2imgStableDiffusionFunction',
    apiPath: '/tools/txt2img-stable-diffusion',
  },
  // Future tools:
  // {
  //   ...img2imgStableDiffusion,
  //   lambdaFunction: 'ToolImg2imgStableDiffusionFunction',
  //   apiPath: '/tools/img2img-stable-diffusion',
  // },
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

