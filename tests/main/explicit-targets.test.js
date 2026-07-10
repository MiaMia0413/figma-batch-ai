import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveExplicitTargets } from '../../src/main/selection/explicit-targets.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveExplicitTargets', () => {
  it('resolves selected and page nodes once while applying the predicate', () => {
    const selected = { id: 'selected', name: 'Selected', type: 'FRAME' };
    const nested = { id: 'nested', name: 'Nested', type: 'RECTANGLE' };
    const rejected = { id: 'rejected', name: 'Rejected', type: 'TEXT' };
    const root = {
      id: 'root',
      name: 'Root',
      type: 'FRAME',
      children: [selected, nested, rejected],
    };
    vi.stubGlobal('figma', {
      currentPage: {
        selection: [selected],
        children: [root],
      },
    });

    const result = resolveExplicitTargets(
      { nodeIds: ['nested', 'selected'], target: '所有目标' },
      (node) => node.type !== 'TEXT',
    );

    expect(result.nodes.map((node) => node.id)).toEqual(['nested', 'selected']);
    expect(result).toMatchObject({
      scope: 'preview',
      sourceCount: 2,
      matchedCount: 2,
      strategy: 'preview-node-ids',
      truncated: false,
    });
  });

  it('honors limits and a caller-provided query normalizer', () => {
    const nodes = ['one', 'two', 'three'].map((id) => ({ id, name: id, type: 'FRAME' }));
    vi.stubGlobal('figma', {
      currentPage: {
        selection: [],
        children: nodes,
      },
    });

    const normalizeQuery = vi.fn(() => 'normalized');
    const result = resolveExplicitTargets(
      { nodeIds: ['one', 'two', 'three'], targetQuery: 'raw' },
      () => true,
      { limit: 2, normalizeQuery },
    );

    expect(result.nodes.map((node) => node.id)).toEqual(['one', 'two']);
    expect(result.query).toBe('normalized');
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(2);
    expect(normalizeQuery).toHaveBeenCalledWith('raw');
  });

  it('resolves approved ids directly in their preview order', () => {
    const page = { id: 'page', type: 'PAGE', parent: { type: 'DOCUMENT' } };
    const nodes = new Map(
      ['one', 'two'].map((id) => [
        id,
        {
          id,
          name: id,
          type: 'FRAME',
          parent: page,
        },
      ]),
    );
    vi.stubGlobal('figma', {
      currentPage: page,
      getNodeById: vi.fn((id) => nodes.get(id) || null),
    });

    const result = resolveExplicitTargets({ nodeIds: ['two', 'one'] }, () => true);

    expect(result.nodes.map((node) => node.id)).toEqual(['two', 'one']);
    expect(globalThis.figma.getNodeById).toHaveBeenCalledTimes(2);
  });

  it('rejects execution when any approved target is no longer valid', () => {
    vi.stubGlobal('figma', {
      currentPage: {
        selection: [],
        children: [{ id: 'one', name: 'one', type: 'FRAME' }],
      },
    });

    expect(() => resolveExplicitTargets({ nodeIds: ['one', 'missing'] }, () => true)).toThrow(
      '预览目标已发生变化',
    );
  });
});
