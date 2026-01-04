import type { McpToolDefinition } from '../types';

/**
 * Transfer the style from one image to another using Stability AI
 * Uses the style-transfer endpoint to apply artistic styles
 */
export const styleTransfer: McpToolDefinition = {
  name: 'style_transfer',
  description:
    'Transfer the artistic style from a style reference image to a content image using Stability AI. Combines the content of one image with the style of another.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded content image (the image whose content to keep)',
      },
      style_image: {
        type: 'string',
        description: 'Base64 encoded style reference image (the image whose style to transfer)',
      },
      prompt: {
        type: 'string',
        description: 'Optional text prompt to guide the style transfer',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the generated image',
      },
      fidelity: {
        type: 'number',
        description:
          'Balance between content and style (0-1, default: 0.5). Lower = more content preservation, higher = more style transfer.',
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
    required: ['image', 'style_image'],
  },
};
