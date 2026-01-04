import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-edit-erase', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('edit_erase');
    expect(toolSchema.inputSchema.required).toContain('image');
    expect(toolSchema.inputSchema.required).toContain('mask');
  });
});
