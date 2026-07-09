export function createFigmaBridge() {
  const pending = new Map();

  window.onmessage = (event) => {
    const message = event.data.pluginMessage;
    if (!message || message.type !== 'command-result') return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.result);
    else request.reject(new Error(message.error || '命令执行失败'));
  };

  return {
    call(command, args = {}) {
      const id = makeId();
      parent.postMessage({ pluginMessage: { type: 'command', id, command, args } }, '*');
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        window.setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(`命令执行超时：${command}`));
        }, 20000);
      });
    },
  };
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
