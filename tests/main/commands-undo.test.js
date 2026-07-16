import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelledError } from '../../src/shared/errors.js';
import { COMMANDS } from '../../src/main/commands.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('command undo boundaries', () => {
  it('commits one undo boundary after a successful canvas mutation', async () => {
    const { page, frame, context, commitUndo } = frameFixture();

    const result = await COMMANDS.batch_set_opacity(
      { scope: 'page', target: 'Promo', opacity: 0.5 },
      context,
    );

    expect(frame.opacity).toBe(0.5);
    expect(commitUndo).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      changed: 1,
      undoCommitted: true,
      scope: 'page',
    });
    expect(result.message).toContain('可在 Figma 中撤销本次操作。');
    expect(page.children).toEqual([frame]);
  });

  it('does not create an undo boundary for read-only tools', async () => {
    const { context, commitUndo } = frameFixture();

    const result = await COMMANDS.inspect_canvas({ scope: 'page', limit: 10 }, context);

    expect(result.nodes).toHaveLength(1);
    expect(commitUndo).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('undoCommitted');
  });

  it('does not create an undo boundary when a mutation changes nothing', async () => {
    const { context, commitUndo, text } = textFixture();

    const result = await COMMANDS.batch_set_text(
      {
        scope: 'page',
        target: 'Title',
        text: 'Hello',
        replaceOnly: true,
      },
      context,
    );

    expect(text.characters).toBe('Welcome back');
    expect(result.changed).toBe(0);
    expect(commitUndo).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('undoCommitted');
  });

  it('commits an undo boundary before propagating cancellation after a partial write', async () => {
    const { frames, context, commitUndo } = twoFrameFixture();

    await expect(
      COMMANDS.batch_set_opacity(
        {
          scope: 'page',
          target: 'Promo',
          nodeIds: frames.map((frame) => frame.id),
          opacity: 0.5,
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });

    expect(frames.map((frame) => frame.opacity)).toEqual([0.5, 1]);
    expect(commitUndo).toHaveBeenCalledTimes(1);
  });

  it('counts a fallback font replacement as a canvas mutation', async () => {
    const { text, context, commitUndo } = fallbackTextFixture();

    const result = await COMMANDS.batch_set_text(
      {
        scope: 'page',
        target: 'Title',
        text: 'Hello',
        replaceOnly: true,
        fallbackFont: { family: 'Inter', style: 'Regular' },
      },
      context,
    );

    expect(text.characters).toBe('Welcome back');
    expect(text.fontName).toEqual({ family: 'Inter', style: 'Regular' });
    expect(result.changed).toBe(1);
    expect(commitUndo).toHaveBeenCalledTimes(1);
    expect(result.undoCommitted).toBe(true);
  });

  it('skips unchanged property writes without creating empty undo steps', async () => {
    const { frame, context, commitUndo } = frameFixture();
    const common = { scope: 'page', target: 'Promo', nodeIds: [frame.id] };

    const results = [
      await COMMANDS.batch_set_fill({ ...common, color: '#336699' }, context),
      await COMMANDS.batch_set_corner_radius({ ...common, radius: 12 }, context),
      await COMMANDS.batch_set_opacity({ ...common, opacity: 1 }, context),
      await COMMANDS.batch_set_visible({ ...common, visible: true }, context),
      await COMMANDS.batch_resize({ ...common, width: 100, height: 50 }, context),
      await COMMANDS.batch_rename_layers({ ...common, mode: 'replace', text: 'Promo' }, context),
    ];
    frame.fills = [];
    results.push(await COMMANDS.batch_remove_fill(common, context));

    expect(results.map(({ changed }) => changed)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(frame.resize).not.toHaveBeenCalled();
    expect(commitUndo).not.toHaveBeenCalled();
  });
});

function frameFixture() {
  const document = { id: 'document', type: 'DOCUMENT', parent: null };
  const page = pageNode(document);
  const frame = {
    id: 'promo',
    name: 'Promo',
    type: 'FRAME',
    parent: page,
    children: [],
    opacity: 1,
    visible: true,
    cornerRadius: 12,
    width: 100,
    height: 50,
    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.6 } }],
    resize: vi.fn(),
  };
  page.children.push(frame);
  const commitUndo = vi.fn();
  vi.stubGlobal('figma', {
    currentPage: page,
    mixed: Symbol('mixed'),
    commitUndo,
    getNodeByIdAsync: vi.fn(async (id) => (id === frame.id ? frame : null)),
  });
  return { page, frame, context: commandContext(), commitUndo };
}

function twoFrameFixture() {
  const document = { id: 'document', type: 'DOCUMENT', parent: null };
  const page = pageNode(document);
  const frames = ['a', 'b'].map((id) => ({
    id,
    name: `Promo ${id.toUpperCase()}`,
    type: 'FRAME',
    parent: page,
    children: [],
    opacity: 1,
  }));
  page.children.push(...frames);
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  const commitUndo = vi.fn();
  let steps = 0;
  vi.stubGlobal('figma', {
    currentPage: page,
    mixed: Symbol('mixed'),
    commitUndo,
    getNodeByIdAsync: vi.fn(async (id) => byId.get(id) || null),
  });
  return {
    frames,
    commitUndo,
    context: {
      ...commandContext(),
      async yieldIfNeeded() {
        steps++;
        if (steps === 2) throw new CancelledError();
      },
    },
  };
}

function textFixture() {
  const document = { id: 'document', type: 'DOCUMENT', parent: null };
  const page = pageNode(document);
  const text = {
    id: 'title',
    name: 'Title',
    type: 'TEXT',
    parent: page,
    characters: 'Welcome back',
    fontName: { family: 'Inter', style: 'Regular' },
  };
  page.children.push(text);
  const commitUndo = vi.fn();
  vi.stubGlobal('figma', {
    currentPage: page,
    mixed: Symbol('mixed'),
    commitUndo,
    loadFontAsync: vi.fn(),
  });
  return { text, context: commandContext(), commitUndo };
}

function fallbackTextFixture() {
  const fixture = textFixture();
  fixture.text.fontName = { family: 'Missing', style: 'Regular' };
  globalThis.figma.loadFontAsync = vi
    .fn()
    .mockRejectedValueOnce(new Error('字体不可用。'))
    .mockResolvedValueOnce(undefined);
  return fixture;
}

function pageNode(parent) {
  return {
    id: 'page',
    name: 'Page',
    type: 'PAGE',
    parent,
    selection: [],
    children: [],
  };
}

function commandContext() {
  return {
    checkCancelled: vi.fn(),
    yieldIfNeeded: vi.fn(),
    yieldToHost: vi.fn(),
  };
}
