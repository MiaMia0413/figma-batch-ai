import { COMMANDS } from './commands.js';

figma.showUI(__html__, {
  width: 420,
  height: 640,
  themeColors: true,
});

figma.ui.onmessage = async (message) => {
  if (!message || message.type !== 'command') return;
  const { id, command, args = {} } = message;

  try {
    const handler = COMMANDS[command];
    if (!handler) throw new Error(`不支持的命令：${command}`);
    const result = await handler(args);
    figma.ui.postMessage({ type: 'command-result', id, ok: true, result });
  } catch (error) {
    figma.ui.postMessage({
      type: 'command-result',
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
