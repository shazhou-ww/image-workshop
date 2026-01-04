import type { McpToolDefinition } from '../types';

/**
 * Remove background from an image using Stability AI
 * Uses the edit/remove-background endpoint to isolate the foreground subject
 */
export const editRemoveBackground: McpToolDefinition = {
  name: 'edit_remove_background',
  description:
    'Remove the background from an image using Stability AI. Isolates the foreground subject and returns an image with transparent background.',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Base64 encoded image data or URL of the source image',
      },
      output_format: {
        type: 'string',
        description:
          'Output image format (default: "png"). Note: use "png" for transparency support.',
        enum: ['png', 'webp'],
        default: 'png',
      },
    },
    required: ['image'],
  },
};
