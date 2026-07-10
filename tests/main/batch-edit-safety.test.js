import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewBatchEdit } from '../../src/main/tools/batch-edit.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('batch edit safety limits', () => {
  it('rejects an overly broad page-level match before changing selection', async () => {
    const selection = [];
    const children = Array.from({ length: 81 }, (_, index) => ({
      id: `node-${index}`,
      name: `Promo ${index}`,
      type: 'FRAME',
      parent: null,
      children: [],
    }));
    vi.stubGlobal('figma', {
      currentPage: { id: 'page', type: 'PAGE', selection, children },
      mixed: Symbol('mixed'),
    });
    const context = {
      checkCancelled: vi.fn(),
      yieldIfNeeded: vi.fn(),
      yieldToHost: vi.fn(),
    };

    await expect(
      previewBatchEdit(
        'batch_rename_layers',
        { scope: 'page', target: 'Promo', mode: 'replace', text: 'Renamed' },
        context,
      ),
    ).rejects.toMatchObject({
      code: 'SAFETY_ERROR',
    });
    expect(globalThis.figma.currentPage.selection).toEqual([]);
  });
});
