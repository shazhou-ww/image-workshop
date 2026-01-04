import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-edit-inpaint', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('edit_inpaint');
    expect(toolSchema.inputSchema.required).toContain('image');
    expect(toolSchema.inputSchema.required).toContain('prompt');
    expect(toolSchema.inputSchema.required).toContain('mask');
  });
});
