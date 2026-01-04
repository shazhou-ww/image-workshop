import type { McpToolDefinition } from '../types';

/**
 * Search for and recolor objects in an image using Stability AI
 * Uses the edit/search-and-recolor endpoint to change colors of specific elements
 */
export const editSearchAndRecolor: McpToolDefinition = {
  name: 'edit_search_and_recolor',
  description:
    'Search for and recolor objects in an image using Stability AI. Find specific objects and change their color based on text prompts.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded image data or URL of the source image',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing the new color (e.g., "bright red", "deep blue")',
      },
      select_prompt: {
        type: 'string',
        description: 'Text prompt describing the object to select and recolor',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the recolored result',
      },
      grow_mask: {
        type: 'number',
        description: 'Number of pixels to grow the detected mask by (default: 3)',
        default: 3,
        minimum: 0,
        maximum: 100,
      },
      seed: {
        type: 'number',
        description:
          'Random seed for reproducibility. If not provided, a random seed will be used.',
      },
      output_format: {
        type: 'string',
        description: 'Output image format (default: "png")',
        enum: ['png', 'jpeg', 'webp'],
        default: 'png',
      },
    },
    required: ['image', 'prompt', 'select_prompt'],
  },
};
