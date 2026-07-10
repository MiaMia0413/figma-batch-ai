import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFigmaBridge } from '../../src/ui/figma-bridge.js';

let posted;
let requestNumber;

beforeEach(() => {
  vi.useFakeTimers();
  posted = [];
  requestNumber = 0;
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    onmessage: null,
  });
  vi.stubGlobal('parent', {
    postMessage: vi.fn((message) => posted.push(message.pluginMessage)),
  });
  vi.stubGlobal('crypto', {
    randomUUID: () => `request-${++requestNumber}`,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createFigmaBridge', () => {
  it('sends cancel and clears pending state when aborted', async () => {
    const bridge = createFigmaBridge();
    const controller = new AbortController();
    const call = bridge.call('inspect_canvas', {}, { signal: controller.signal });

    expect(posted).toEqual([
      {
        type: 'command',
        id: 'request-1',
        command: 'inspect_canvas',
        args: {},
      },
    ]);

    controller.abort();

    await expect(call).rejects.toMatchObject({
      name: 'AbortError',
      message: '操作已停止。',
    });
    expect(posted.at(-1)).toEqual({ type: 'cancel', id: 'request-1' });
    expect(vi.getTimerCount()).toBe(0);

    globalThis.window.onmessage({
      data: {
        pluginMessage: {
          type: 'command-result',
          id: 'request-1',
          ok: true,
          result: 'late',
        },
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends cancel and rejects with a timeout error on timeout', async () => {
    const bridge = createFigmaBridge();
    const call = bridge.call('slow_command');
    const rejection = expect(call).rejects.toThrow('命令执行超时：slow_command');

    await vi.advanceTimersByTimeAsync(20000);

    await rejection;
    expect(posted.at(-1)).toEqual({ type: 'cancel', id: 'request-1' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans timer and abort listener after a normal response', async () => {
    const bridge = createFigmaBridge();
    const controller = new AbortController();
    const call = bridge.call('inspect_canvas', {}, { signal: controller.signal });

    globalThis.window.onmessage({
      data: {
        pluginMessage: {
          type: 'command-result',
          id: 'request-1',
          ok: true,
          result: { count: 3 },
        },
      },
    });

    await expect(call).resolves.toEqual({ count: 3 });
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    expect(posted).toHaveLength(1);
  });

  it('restores structured errors from failed command results', async () => {
    const bridge = createFigmaBridge();
    const call = bridge.call('batch_resize');

    globalThis.window.onmessage({
      data: {
        pluginMessage: {
          type: 'command-result',
          id: 'request-1',
          ok: false,
          error: 'width 必须是数字。',
          code: 'VALIDATION_ERROR',
          name: 'ValidationError',
          details: { field: 'width' },
        },
      },
    });

    await expect(call).rejects.toMatchObject({
      message: 'width 必须是数字。',
      code: 'VALIDATION_ERROR',
      name: 'ValidationError',
      details: { field: 'width' },
    });
  });
});
