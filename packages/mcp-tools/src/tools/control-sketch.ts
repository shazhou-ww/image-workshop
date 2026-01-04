import type { McpToolDefinition } from '../types';

/**
 * Generate an image from a sketch using Stability AI
 * Uses the control/sketch endpoint for sketch-to-image generation
 */
export const controlSketch: McpToolDefinition = {
  name: 'control_sketch',
  description:
    'Generate an image from a sketch using Stability AI. Transform rough sketches or line drawings into detailed images based on a text prompt.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded sketch/line drawing image',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing what to generate from the sketch',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the generated image',
      },
      control_strength: {
        type: 'number',
        description:
          'How closely to follow the sketch (0-1, default: 0.7). Higher = more faithful to sketch.',
        default: 0.7,
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
