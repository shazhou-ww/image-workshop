import type { McpToolDefinition } from '../types';

/**
 * Extend an image beyond its original boundaries using Stability AI
 * Uses the edit/outpaint endpoint to expand the canvas
 */
export const editOutpaint: McpToolDefinition = {
  name: 'edit_outpaint',
  description:
    'Extend an image beyond its original boundaries using Stability AI. Expand the canvas in any direction with AI-generated content.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded image data or URL of the source image to extend',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing what to generate in the extended areas (optional)',
      },
      left: {
        type: 'number',
        description: 'Number of pixels to extend on the left side (default: 0)',
        default: 0,
        minimum: 0,
        maximum: 2000,
      },
      right: {
        type: 'number',
        description: 'Number of pixels to extend on the right side (default: 0)',
        default: 0,
        minimum: 0,
        maximum: 2000,
      },
      up: {
        type: 'number',
        description: 'Number of pixels to extend on the top (default: 0)',
        default: 0,
        minimum: 0,
        maximum: 2000,
      },
      down: {
        type: 'number',
        description: 'Number of pixels to extend on the bottom (default: 0)',
        default: 0,
        minimum: 0,
        maximum: 2000,
      },
      creativity: {
        type: 'number',
        description:
          'How creative the model should be (0-1, default: 0.5). Higher values = more creative.',
        default: 0.5,
        minimum: 0,
        maximum: 1,
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
    required: ['image'],
  },
};
