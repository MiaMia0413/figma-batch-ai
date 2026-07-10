import { afterEach, describe, expect, it, vi } from 'vitest';
import { duplicateLayers } from '../../src/main/tools/duplicate.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('duplicateLayers', () => {
  it('keeps a requested vertical copy group to the right without overlap', async () => {
    const document = { id: 'document', type: 'DOCUMENT', parent: null };
    const page = {
      id: 'page',
      type: 'PAGE',
      parent: document,
      selection: [],
      children: [],
      insertChild(index, child) {
        const previous = this.children.indexOf(child);
        if (previous >= 0) this.children.splice(previous, 1);
        this.children.splice(index, 0, child);
        child.parent = this;
      },
    };
    let copyNumber = 0;
    const source = {
      id: 'source',
      name: 'Module',
      type: 'FRAME',
      parent: page,
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      clone() {
        const copy = {
          ...this,
          id: `copy-${++copyNumber}`,
          clone: this.clone,
        };
        page.children.push(copy);
        return copy;
      },
    };
    page.children.push(source);
    vi.stubGlobal('figma', {
      currentPage: page,
      getNodeById: (id) => (id === source.id ? source : null),
      viewport: { scrollAndZoomIntoView: vi.fn() },
    });
    const context = {
      checkCancelled: vi.fn(),
      yieldIfNeeded: vi.fn(),
      yieldToHost: vi.fn(),
    };

    const result = await duplicateLayers(
      {
        nodeIds: [source.id],
        count: 2,
        placement: 'right',
        layout: 'vertical',
      },
      context,
    );

    expect(result.changed).toBe(2);
    expect(result.nodes.map(({ id, width, height }) => ({ id, width, height }))).toEqual([
      { id: 'copy-1', width: 100, height: 40 },
      { id: 'copy-2', width: 100, height: 40 },
    ]);
    expect(page.selection.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 148, y: 0 },
      { x: 148, y: 88 },
    ]);
  });
});
