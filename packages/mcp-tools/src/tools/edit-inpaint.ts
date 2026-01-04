import type { McpToolDefinition } from '../types';

/**
 * Inpaint (fill in) masked regions of an image using Stability AI
 * Uses the edit/inpaint endpoint to replace or modify specific areas
 */
export const editInpaint: McpToolDefinition = {
  name: 'edit_inpaint',
  description:
    'Inpaint (fill in) masked regions of an image using Stability AI. Replace or modify specific areas with AI-generated content based on a text prompt.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded image data or URL of the source image to edit',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing what to generate in the masked region',
      },
      mask: {
        type: 'string',
        description:
          'Base64 encoded mask image where white (255) indicates areas to inpaint and black (0) indicates areas to keep',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the generated content',
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
    required: ['image', 'prompt', 'mask'],
  },
};
