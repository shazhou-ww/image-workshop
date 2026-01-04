import type { McpToolDefinition } from '../types';

/**
 * Text-to-Image generation using Stable Diffusion (Stability AI)
 */
export const txt2imgStableDiffusion: McpToolDefinition = {
  name: 'txt2img_stable_diffusion',
  description: 'Generate an image from a text prompt using Stable Diffusion (Stability AI)',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'The text prompt describing what to generate. Be descriptive for best results.',
      },
      negative_prompt: {
        type: 'string',
        description:
          'What to avoid in the generated image (e.g., "blurry, low quality, distorted")',
      },
      width: {
        type: 'number',
        description: 'Image width in pixels (default: 1024). Must be a multiple of 64.',
        default: 1024,
      },
      height: {
        type: 'number',
        description: 'Image height in pixels (default: 1024). Must be a multiple of 64.',
        default: 1024,
      },
      steps: {
        type: 'number',
        description: 'Number of diffusion steps (default: 30). Higher = better quality but slower.',
        default: 30,
        minimum: 10,
        maximum: 50,
      },
      cfg_scale: {
        type: 'number',
        description:
          'How closely to follow the prompt (default: 7.0). Higher = stricter adherence.',
        default: 7.0,
        minimum: 1,
        maximum: 35,
      },
      seed: {
        type: 'number',
        description:
          'Random seed for reproducibility. If not provided, a random seed will be used.',
      },
      style_preset: {
        type: 'string',
        description: 'Style preset to guide generation',
        enum: [
          '3d-model',
          'analog-film',
          'anime',
          'cinematic',
          'comic-book',
          'digital-art',
          'enhance',
          'fantasy-art',
          'isometric',
          'line-art',
          'low-poly',
          'modeling-compound',
          'neon-punk',
          'origami',
          'photographic',
          'pixel-art',
          'tile-texture',
        ],
      },
      output_format: {
        type: 'string',
        description: 'Output image format (default: "png")',
        enum: ['png', 'jpeg', 'webp'],
        default: 'png',
      },
    },
    required: ['prompt'],
  },
};
