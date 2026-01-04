import type { McpToolDefinition } from '../types';

/**
 * Generate an image following the structure of a reference image using Stability AI
 * Uses the control/structure endpoint for structure-guided generation
 */
export const controlStructure: McpToolDefinition = {
  name: 'control_structure',
  description:
    'Generate an image following the structure of a reference image using Stability AI. Maintains the composition and layout while generating new content.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded reference image that defines the structure',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing what to generate while following the structure',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to avoid in the generated image',
      },
      control_strength: {
        type: 'number',
        description:
          'How closely to follow the structure (0-1, default: 0.7). Higher = more faithful to structure.',
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
