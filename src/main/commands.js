import { validateToolArguments } from '../shared/command-protocol.js';
import { TOOL_REGISTRY, TOOL_REGISTRY_BY_NAME } from '../shared/tool-registry.js';
import { COMMAND_NAMES, PREVIEW_HANDLER_NAMES } from './command-names.js';
import { getSettings, saveSettings } from './settings.js';
import { collectNodesAsync, MAX_CANVAS_NODES, scopedRoots, summarizeNode } from './selection.js';
import {
  batchRenameLayers,
  batchRemoveFill,
  batchResize,
  batchSetCornerRadius,
  batchSetFill,
  batchSetOpacity,
  batchSetText,
  batchSetVisible,
  previewBatchEdit,
} from './tools/batch-edit.js';
import { designQaCheck } from './tools/design-qa.js';
import { duplicateLayers, previewDuplicateLayers } from './tools/duplicate.js';

const PREVIEW_HANDLERS = {
  batch: ({ name, args, context }) => previewBatchEdit(name, args, context),
  duplicate: ({ args, context }) => previewDuplicateLayers(args, context),
};

export const COMMANDS = {
  get_settings: getSettings,
  save_settings: saveSettings,
  inspect_canvas: registeredTool('inspect_canvas', inspectCanvas),
  inspect_selection: inspectCanvas,
  preview_batch_edit: previewTool,
  batch_set_text: registeredTool('batch_set_text', batchSetText),
  batch_set_fill: registeredTool('batch_set_fill', batchSetFill),
  batch_remove_fill: registeredTool('batch_remove_fill', batchRemoveFill),
  batch_set_corner_radius: registeredTool('batch_set_corner_radius', batchSetCornerRadius),
  batch_set_opacity: registeredTool('batch_set_opacity', batchSetOpacity),
  batch_set_visible: registeredTool('batch_set_visible', batchSetVisible),
  batch_resize: registeredTool('batch_resize', batchResize),
  batch_rename_layers: registeredTool('batch_rename_layers', batchRenameLayers),
  duplicate_layers: registeredTool('duplicate_layers', duplicateLayers),
  design_qa_check: registeredTool('design_qa_check', designQaCheck),
  list_available_fonts: listAvailableFonts,
  notify: notifyUser,
};

assertCommandRegistry();

function previewTool(args = {}, context) {
  const name = String(args.toolName || '');
  const metadata = TOOL_REGISTRY_BY_NAME.get(name);
  const handler = metadata && PREVIEW_HANDLERS[metadata.preview];
  if (!handler) throw new Error(`不支持预览该工具：${name}`);

  const toolArgs = args.toolArgs && typeof args.toolArgs === 'object' ? args.toolArgs : {};
  validateToolArguments(name, toolArgs, { allowInternal: true });
  return handler({ name, args: toolArgs, context });
}

function validatedTool(name, handler) {
  return (args = {}, context) => {
    validateToolArguments(name, args, { allowInternal: true });
    return handler(args, context);
  };
}

function registeredTool(name, handler) {
  const metadata = TOOL_REGISTRY_BY_NAME.get(name);
  const validated = validatedTool(name, handler);
  if (!metadata?.mutates) return validated;

  return async (args = {}, context) => {
    let mutated = false;
    const trackedContext = {
      ...context,
      markMutated() {
        mutated = true;
        context?.markMutated?.();
      },
    };
    let result;

    try {
      result = await validated(args, trackedContext);
    } catch (error) {
      if (mutated) figma.commitUndo();
      throw error;
    }

    mutated ||= Number(result?.changed) > 0;
    if (!mutated) return result;

    figma.commitUndo();
    return {
      ...result,
      undoCommitted: true,
      message: undoableMessage(result.message),
    };
  };
}

function undoableMessage(message) {
  const text = String(message || '').trim();
  const hint = '可在 Figma 中撤销本次操作。';
  return text ? `${text} ${hint}` : hint;
}

function assertCommandRegistry() {
  const handlerNames = Object.keys(COMMANDS);
  if (
    handlerNames.length !== COMMAND_NAMES.length ||
    handlerNames.some((name) => !COMMAND_NAMES.includes(name))
  ) {
    throw new Error('COMMANDS handlers must match COMMAND_NAMES.');
  }

  for (const { name } of TOOL_REGISTRY) {
    if (!COMMANDS[name]) throw new Error(`LLM tool is missing a command handler: ${name}`);
  }

  const previewHandlerNames = Object.keys(PREVIEW_HANDLERS);
  if (
    previewHandlerNames.length !== PREVIEW_HANDLER_NAMES.length ||
    previewHandlerNames.some((name) => !PREVIEW_HANDLER_NAMES.includes(name))
  ) {
    throw new Error('Preview handlers must match PREVIEW_HANDLER_NAMES.');
  }
}

async function inspectCanvas(args = {}, context) {
  const roots = scopedRoots(args.scope);
  const collected = await collectNodesAsync(
    roots.nodes,
    Math.min(Number(args.limit) || 120, MAX_CANVAS_NODES),
    context,
  );
  await context?.yieldToHost();
  return {
    scope: roots.scope,
    sourceCount: roots.sourceCount,
    truncated: roots.truncated || collected.truncated,
    limit: collected.limit,
    nodes: collected.nodes.map(summarizeNode),
  };
}

function notifyUser(args) {
  figma.notify(String(args.message || 'Done'));
  return { notified: true };
}

async function listAvailableFonts(_args, context) {
  const fonts = await figma.listAvailableFontsAsync();
  context?.checkCancelled();
  const seen = new Set();
  return fonts
    .map((item) => item.fontName)
    .filter((font) => {
      const key = `${font.family}::${font.style}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.family} ${a.style}`.localeCompare(`${b.family} ${b.style}`))
    .slice(0, 300);
}
