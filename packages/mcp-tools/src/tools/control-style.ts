import type { McpToolDefinition } from '../types';

/**
 * Generate an image in the style of a reference image using Stability AI
 * Uses the control/style endpoint for style-guided generation
 */
export const controlStyle: McpToolDefinition = {
  name: 'control_style',
  description:
    'Generate an image in the style of a reference image using Stability AI. Apply the artistic style, colors, and textures from a reference to new content.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded reference image that defines the style',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing what to generate in the reference style',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the generated image',
      },
      fidelity: {
        type: 'number',
        description:
          'How closely to match the style (0-1, default: 0.5). Higher = more faithful to style.',
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
    required: ['image', 'prompt'],
  },
};
