import { describe, expect, it } from 'vitest';
import { TOOL_REGISTRY, TOOL_REGISTRY_BY_NAME } from '../../src/shared/tool-registry.js';
import { CONFIRM_TOOLS, TOOLS } from '../../src/ui/tools.js';

describe('tool registry', () => {
  it('contains unique, complete LLM tool metadata', () => {
    const names = TOOL_REGISTRY.map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'inspect_canvas',
      'batch_set_text',
      'batch_set_fill',
      'batch_remove_fill',
      'batch_set_corner_radius',
      'batch_set_opacity',
      'batch_set_visible',
      'batch_resize',
      'batch_rename_layers',
      'duplicate_layers',
      'design_qa_check',
    ]);

    for (const metadata of TOOL_REGISTRY) {
      expect(metadata).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          description: expect.any(String),
          parameters: expect.objectContaining({
            type: 'object',
            properties: expect.any(Object),
            required: expect.any(Array),
            additionalProperties: false,
          }),
          confirm: expect.any(Boolean),
        }),
      );
      expect([false, 'batch', 'duplicate']).toContain(metadata.preview);
      expect(TOOL_REGISTRY_BY_NAME.get(metadata.name)).toBe(metadata);
    }
  });

  it('derives model tools and confirmation names from registry metadata', () => {
    expect(TOOLS).toEqual(
      TOOL_REGISTRY.map(({ name, description, parameters }) => ({
        type: 'function',
        function: { name, description, parameters },
      })),
    );
    expect([...CONFIRM_TOOLS]).toEqual(
      TOOL_REGISTRY.filter(({ confirm }) => confirm).map(({ name }) => name),
    );
  });

  it('assigns a preview strategy exactly when confirmation is required', () => {
    for (const metadata of TOOL_REGISTRY) {
      expect(metadata.confirm).toBe(metadata.preview !== false);
    }

    expect(TOOL_REGISTRY_BY_NAME.get('duplicate_layers').preview).toBe('duplicate');
    expect(TOOL_REGISTRY.filter(({ preview }) => preview === 'batch').map(({ name }) => name)).toEqual([
      'batch_set_text',
      'batch_set_fill',
      'batch_remove_fill',
      'batch_set_corner_radius',
      'batch_set_opacity',
      'batch_set_visible',
      'batch_resize',
      'batch_rename_layers',
    ]);
  });
});
