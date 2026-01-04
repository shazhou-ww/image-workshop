import type { McpToolDefinition } from '../types';

/**
 * Erase objects from an image using Stability AI
 * Uses the edit/erase endpoint to remove unwanted elements
 */
export const editErase: McpToolDefinition = {
  name: 'edit_erase',
  description:
    'Erase objects from an image using Stability AI. Uses a mask to specify which areas to remove and intelligently fills them in.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded image data or URL of the source image to edit',
      },
      mask: {
        type: 'string',
        description:
          'Base64 encoded mask image where white (255) indicates areas to erase and black (0) indicates areas to keep',
      },
      grow_mask: {
        type: 'number',
        description: 'Number of pixels to grow the mask by (default: 5). Helps blend edges.',
        default: 5,
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
    required: ['image', 'mask'],
  },
};
