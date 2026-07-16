import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchSetText } from '../../src/main/tools/batch-edit.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('batchSetText', () => {
  it('does not report a change when substring replacement finds no matching text', async () => {
    const document = { id: 'document', type: 'DOCUMENT', parent: null };
    const page = {
      id: 'page',
      type: 'PAGE',
      parent: document,
      selection: [],
      children: [],
    };
    const title = {
      id: 'title',
      name: 'Title',
      type: 'TEXT',
      parent: page,
      characters: 'Welcome back',
      fontName: { family: 'Inter', style: 'Regular' },
    };
    page.children.push(title);

    vi.stubGlobal('figma', {
      currentPage: page,
      mixed: Symbol('mixed'),
      loadFontAsync: vi.fn(),
    });
    const context = {
      checkCancelled: vi.fn(),
      yieldIfNeeded: vi.fn(),
      yieldToHost: vi.fn(),
    };

    const result = await batchSetText(
      {
        scope: 'page',
        target: 'Title',
        text: 'Hello',
        replaceOnly: true,
      },
      context,
    );

    expect(result).toMatchObject({ changed: 0, skipped: [] });
    expect(title.characters).toBe('Welcome back');
  });
});
