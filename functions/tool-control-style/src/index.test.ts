import { describe, expect, it } from 'vitest';
import { toolSchema } from './index';

describe('tool-control-style', () => {
  it('should have valid tool schema', () => {
    expect(toolSchema.name).toBe('control_style');
    expect(toolSchema.inputSchema.required).toContain('image');
    expect(toolSchema.inputSchema.required).toContain('prompt');
  });
});
