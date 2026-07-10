import { describe, expect, it, vi } from 'vitest';
import { createCommandDispatcher } from '../../src/main/command-dispatcher.js';

describe('createCommandDispatcher', () => {
  it('executes commands strictly in enqueue order', async () => {
    const firstGate = deferred();
    const events = [];
    const dispatcher = createCommandDispatcher({
      handlers: {
        first: async () => {
          events.push('first:start');
          await firstGate.promise;
          events.push('first:end');
          return 'one';
        },
        second: async () => {
          events.push('second');
          return 'two';
        },
      },
    });

    const first = dispatcher.enqueue({ id: '1', command: 'first' });
    const second = dispatcher.enqueue({ id: '2', command: 'second' });
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    firstGate.resolve();
    await expect(first).resolves.toMatchObject({ id: '1', ok: true, result: 'one' });
    await expect(second).resolves.toMatchObject({ id: '2', ok: true, result: 'two' });
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('cancels a queued command without invoking its handler', async () => {
    const gate = deferred();
    const queuedHandler = vi.fn();
    const dispatcher = createCommandDispatcher({
      handlers: {
        blocking: () => gate.promise,
        queued: queuedHandler,
      },
    });

    const first = dispatcher.enqueue({ id: '1', command: 'blocking' });
    const queued = dispatcher.enqueue({ id: '2', command: 'queued' });
    expect(dispatcher.cancel('2')).toBe(true);
    gate.resolve('done');

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(queued).resolves.toMatchObject({
      id: '2',
      ok: false,
      error: '操作已取消。',
      code: 'CANCELLED',
      name: 'CancelledError',
    });
    expect(queuedHandler).not.toHaveBeenCalled();
  });

  it('cooperatively cancels a running command at a host yield', async () => {
    const yieldGate = deferred();
    const mutated = vi.fn();
    const dispatcher = createCommandDispatcher({
      handlers: {
        mutate: async (_args, context) => {
          await context.yieldToHost();
          mutated();
        },
      },
      yieldToHost: () => yieldGate.promise,
    });

    const result = dispatcher.enqueue({ id: 'running', command: 'mutate' });
    await Promise.resolve();
    expect(dispatcher.cancel('running')).toBe(true);
    yieldGate.resolve();

    await expect(result).resolves.toMatchObject({
      id: 'running',
      ok: false,
      error: '操作已取消。',
      code: 'CANCELLED',
      name: 'CancelledError',
    });
    expect(mutated).not.toHaveBeenCalled();
  });

  it('reports success when cancellation arrives after the final cooperative checkpoint', async () => {
    const operationGate = deferred();
    const mutated = vi.fn();
    const dispatcher = createCommandDispatcher({
      handlers: {
        mutate: async () => {
          await operationGate.promise;
          mutated();
          return { changed: 1 };
        },
      },
    });

    const result = dispatcher.enqueue({ id: 'running', command: 'mutate' });
    await Promise.resolve();
    expect(dispatcher.cancel('running')).toBe(true);
    operationGate.resolve();

    await expect(result).resolves.toMatchObject({
      id: 'running',
      ok: true,
      result: { changed: 1 },
    });
    expect(mutated).toHaveBeenCalledOnce();
  });
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
