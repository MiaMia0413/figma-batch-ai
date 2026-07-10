import { deserializeError } from '../shared/errors.js';

export function createFigmaBridge() {
  const pending = new Map();

  window.onmessage = (event) => {
    const message = event.data?.pluginMessage;
    if (!message || message.type !== 'command-result') return;
    const request = pending.get(message.id);
    if (!request) return;
    request.cleanup();
    if (message.ok) request.resolve(message.result);
    else request.reject(deserializeError(message));
  };

  return {
    call(command, args = {}, { signal } = {}) {
      const id = makeId();
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }

        let timer;
        const cleanup = () => {
          if (!pending.delete(id)) return;
          window.clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        };
        const cancel = () => {
          parent.postMessage({ pluginMessage: { type: 'cancel', id } }, '*');
        };
        const abort = () => {
          cleanup();
          cancel();
          reject(abortError());
        };

        timer = window.setTimeout(() => {
          if (!pending.has(id)) return;
          cleanup();
          cancel();
          reject(new Error(`命令执行超时：${command}`));
        }, 20000);
        pending.set(id, { resolve, reject, cleanup });
        signal?.addEventListener('abort', abort, { once: true });
        parent.postMessage({ pluginMessage: { type: 'command', id, command, args } }, '*');
      });
    },
  };
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function abortError() {
  const error = new Error('操作已停止。');
  error.name = 'AbortError';
  return error;
}
