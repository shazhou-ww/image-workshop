import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-edit-remove-background', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('edit_remove_background');
    expect(toolSchema.inputSchema.required).toContain('image');
  });
});
