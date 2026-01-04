import type { McpToolDefinition } from '../types';

/**
 * Search for and replace objects in an image using Stability AI
 * Uses the edit/search-and-replace endpoint to find and substitute elements
 */
export const editSearchAndReplace: McpToolDefinition = {
  name: 'edit_search_and_replace',
  description:
    'Search for and replace objects in an image using Stability AI. Find specific objects and replace them with something else based on text prompts.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded image data or URL of the source image',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing what to generate as the replacement',
      },
      search_prompt: {
        type: 'string',
        description: 'Text prompt describing the object to search for and replace',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the generated replacement',
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
    required: ['image', 'prompt', 'search_prompt'],
  },
};
