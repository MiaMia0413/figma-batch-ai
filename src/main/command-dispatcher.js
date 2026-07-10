import { CancelledError, PluginError, serializeError } from '../shared/errors.js';

const DEFAULT_YIELD_INTERVAL = 20;

export function createCommandDispatcher({
  handlers,
  onResult = () => {},
  yieldToHost = defaultYieldToHost,
  yieldInterval = DEFAULT_YIELD_INTERVAL,
}) {
  const queue = [];
  let active = null;
  let draining = false;

  function enqueue({ id, command, args = {} }) {
    const entry = {
      id,
      command,
      args,
      cancelled: false,
      resolve: null,
    };
    const completion = new Promise((resolve) => {
      entry.resolve = resolve;
    });

    queue.push(entry);
    void drain();
    return completion;
  }

  function cancel(id) {
    if (active?.id === id) {
      active.cancelled = true;
      return true;
    }

    const queued = queue.find((entry) => entry.id === id);
    if (!queued) return false;
    queued.cancelled = true;
    return true;
  }

  async function drain() {
    if (draining) return;
    draining = true;

    try {
      while (queue.length) {
        const entry = queue.shift();
        active = entry;
        const result = await execute(entry);
        active = null;
        onResult(result);
        entry.resolve(result);
      }
    } finally {
      active = null;
      draining = false;
      if (queue.length) void drain();
    }
  }

  async function execute(entry) {
    try {
      const handler = handlers[entry.command];
      if (!handler) throw new PluginError(`不支持的命令：${entry.command}`);
      const context = createCancellationContext(entry, yieldToHost, yieldInterval);
      context.checkCancelled();
      const result = await handler(entry.args, context);
      return { type: 'command-result', id: entry.id, ok: true, result };
    } catch (error) {
      return {
        type: 'command-result',
        id: entry.id,
        ok: false,
        ...serializeError(error),
      };
    }
  }

  return { enqueue, cancel };
}

function createCancellationContext(entry, yieldToHost, yieldInterval) {
  let steps = 0;

  function checkCancelled() {
    if (!entry.cancelled) return;
    throw new CancelledError();
  }

  async function yieldHost() {
    await yieldToHost();
    checkCancelled();
  }

  async function yieldIfNeeded() {
    checkCancelled();
    steps++;
    if (steps % yieldInterval === 0) await yieldHost();
  }

  return {
    checkCancelled,
    yieldIfNeeded,
    yieldToHost: yieldHost,
  };
}

function defaultYieldToHost() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
