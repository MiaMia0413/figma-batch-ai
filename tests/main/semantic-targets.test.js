import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSemanticTargets } from '../../src/main/semantic-targets.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveSemanticTargets', () => {
  it('resolves text and its semantic background from the same target phrase', async () => {
    const { page, text, background } = fixture();
    vi.stubGlobal('figma', { currentPage: page, mixed: Symbol('mixed') });
    const context = { yieldIfNeeded: vi.fn(), checkCancelled: vi.fn() };

    const textResult = await resolveSemanticTargets(
      { scope: 'page', target: '立即购买' },
      'text',
      (node) => node.type === 'TEXT',
      context,
    );
    const backgroundResult = await resolveSemanticTargets(
      { scope: 'page', target: '立即购买' },
      'background',
      (node) => 'fills' in node,
      context,
    );

    expect(textResult).toMatchObject({
      nodes: [text],
      strategy: 'text-content',
      targetKind: 'text-replacement',
      scope: 'page',
    });
    expect(backgroundResult).toMatchObject({
      nodes: [background],
      strategy: 'text-anchor-background',
      scope: 'page',
    });
    expect(context.yieldIfNeeded).toHaveBeenCalled();
  });

  it('uses the selected container directly for an explicit selection target', async () => {
    const { page, button } = fixture();
    page.selection = [button];
    vi.stubGlobal('figma', { currentPage: page, mixed: Symbol('mixed') });

    const result = await resolveSemanticTargets(
      { scope: 'selection', target: '选中的图层' },
      'container',
      (node) => node.type === 'FRAME',
    );

    expect(result).toMatchObject({
      nodes: [button],
      strategy: 'direct-selection',
      scope: 'selection',
    });
  });
});

function fixture() {
  const document = { id: 'document', name: 'Document', type: 'DOCUMENT', parent: null };
  const page = {
    id: 'page',
    name: 'Page',
    type: 'PAGE',
    parent: document,
    selection: [],
    children: [],
  };
  const button = node('button', '主按钮', 'FRAME', page, {
    children: [],
    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 48 },
  });
  const background = node('background', 'Button background', 'RECTANGLE', button, {
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }],
    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 48 },
  });
  const text = node('text', 'Label', 'TEXT', button, {
    characters: '立即购买',
    absoluteBoundingBox: { x: 20, y: 14, width: 80, height: 20 },
  });
  button.children.push(background, text);
  page.children.push(button);
  return { page, button, background, text };
}

function node(id, name, type, parent, extra = {}) {
  return { id, name, type, parent, visible: true, ...extra };
}
