import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchRenameLayers, batchSetText } from '../../src/main/tools/batch-edit.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('batchRenameLayers', () => {
  it('adds a prefix without discarding the existing layer name', async () => {
    const document = { id: 'document', type: 'DOCUMENT', parent: null };
    const page = { id: 'page', type: 'PAGE', parent: document, selection: [], children: [] };
    const icon = { id: 'icon', type: 'VECTOR', name: 'Arrow Right', parent: page };
    page.children.push(icon);

    vi.stubGlobal('figma', {
      currentPage: page,
      getNodeByIdAsync: vi.fn(async (id) => (id === icon.id ? icon : null)),
    });

    const result = await batchRenameLayers(
      {
        nodeIds: [icon.id],
        target: '所有图标',
        mode: 'prefix',
        text: 'Icon',
      },
      batchContext(),
    );

    expect(icon.name).toBe('Icon Arrow Right');
    expect(result).toMatchObject({ changed: 1, mode: 'prefix', targetCount: 1 });
  });
});

describe('batchSetText', () => {
  it('rejects a container-scoped update without a text target', async () => {
    await expect(
      batchSetText(
        {
          containerTarget: '登录弹窗',
          target: '',
          text: '欢迎回来',
        },
        batchContext(),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

function batchContext() {
  return {
    checkCancelled: vi.fn(),
    yieldIfNeeded: vi.fn(),
    yieldToHost: vi.fn(),
  };
}
