import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-edit-search-and-replace', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('edit_search_and_replace');
    expect(toolSchema.inputSchema.required).toContain('image');
    expect(toolSchema.inputSchema.required).toContain('prompt');
    expect(toolSchema.inputSchema.required).toContain('search_prompt');
  });
});
