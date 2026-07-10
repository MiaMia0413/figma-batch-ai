import { COMMANDS } from './commands.js';
import { createCommandDispatcher } from './command-dispatcher.js';

figma.showUI(__html__, {
  width: 420,
  height: 640,
  themeColors: true,
});

const dispatcher = createCommandDispatcher({
  handlers: COMMANDS,
  onResult: (message) => figma.ui.postMessage(message),
});

figma.ui.onmessage = (message) => {
  if (!message) return;
  if (message.type === 'cancel') {
    dispatcher.cancel(message.id);
    return;
  }
  if (message.type === 'command') void dispatcher.enqueue(message);
};
