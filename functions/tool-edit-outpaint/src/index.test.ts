import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-edit-outpaint', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('edit_outpaint');
    expect(toolSchema.inputSchema.required).toContain('image');
  });
});
