import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-style-transfer', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('style_transfer');
    expect(toolSchema.inputSchema.required).toContain('image');
    expect(toolSchema.inputSchema.required).toContain('style_image');
  });
});
