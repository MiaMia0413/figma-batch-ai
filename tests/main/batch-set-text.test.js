import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchSetFill, batchSetText } from '../../src/main/tools/batch-edit.js';

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

  it('uses the shared container phrase for text and fill descendant targeting', async () => {
    const document = { id: 'document', type: 'DOCUMENT', parent: null };
    const page = {
      id: 'page',
      name: 'Page',
      type: 'PAGE',
      parent: document,
      selection: [],
      children: [],
    };
    const dialog = {
      id: 'dialog',
      name: '登录弹窗',
      type: 'FRAME',
      parent: page,
      visible: true,
      children: [],
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 240 },
    };
    const title = {
      id: 'title',
      name: 'Heading',
      type: 'TEXT',
      parent: dialog,
      visible: true,
      characters: '欢迎',
      fontName: { family: 'Inter', style: 'Regular' },
      fontSize: 24,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      absoluteBoundingBox: { x: 24, y: 24, width: 180, height: 32 },
    };
    dialog.children.push(title);
    page.children.push(dialog);

    vi.stubGlobal('figma', {
      currentPage: page,
      mixed: Symbol('mixed'),
      loadFontAsync: vi.fn(),
    });
    const context = {
      checkCancelled: vi.fn(),
      markMutated: vi.fn(),
      yieldIfNeeded: vi.fn(),
      yieldToHost: vi.fn(),
    };

    const textResult = await batchSetText(
      {
        scope: 'page',
        target: '登录弹窗标题文字',
        text: '欢迎回来',
        replaceOnly: false,
      },
      context,
    );
    const fillResult = await batchSetFill(
      {
        scope: 'page',
        target: '登录弹窗标题文字',
        color: '#4BC430',
      },
      context,
    );

    expect(textResult).toMatchObject({
      changed: 1,
      targetQuery: '标题',
    });
    expect(fillResult).toMatchObject({
      changed: 1,
      targetQuery: '标题',
    });
    expect(title.characters).toBe('欢迎回来');
  });
});
