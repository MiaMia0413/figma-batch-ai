import { getSettings, saveSettings } from './settings.js';
import { collectNodes, MAX_CANVAS_NODES, scopedRoots, summarizeNode } from './selection.js';
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
import { duplicateLayers } from './tools/duplicate.js';

export const COMMANDS = {
  get_settings: getSettings,
  save_settings: saveSettings,
  inspect_canvas: inspectCanvas,
  inspect_selection: inspectCanvas,
  preview_batch_edit: previewBatchEdit,
  batch_set_text: batchSetText,
  batch_set_fill: batchSetFill,
  batch_remove_fill: batchRemoveFill,
  batch_set_corner_radius: batchSetCornerRadius,
  batch_set_opacity: batchSetOpacity,
  batch_set_visible: batchSetVisible,
  batch_resize: batchResize,
  batch_rename_layers: batchRenameLayers,
  duplicate_layers: duplicateLayers,
  design_qa_check: designQaCheck,
  list_available_fonts: listAvailableFonts,
  notify: notifyUser,
};

async function inspectCanvas(args = {}) {
  const roots = scopedRoots(args.scope);
  const collected = collectNodes(roots.nodes, Math.min(Number(args.limit) || 120, MAX_CANVAS_NODES));
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

async function listAvailableFonts() {
  const fonts = await figma.listAvailableFontsAsync();
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
