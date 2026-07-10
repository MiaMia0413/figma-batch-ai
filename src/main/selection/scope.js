import { SafetyError } from '../../shared/errors.js';
import { MAX_CANVAS_NODES, MAX_SELECTION_NODES } from './limits.js';

export function limitedSelection() {
  const selection = figma.currentPage.selection;
  const nodes = selection.slice(0, MAX_SELECTION_NODES);
  if (!nodes.length) throw new SafetyError('当前没有选中图层。请使用页面范围编辑当前页面。');
  return {
    nodes,
    selectionCount: selection.length,
    truncated: selection.length > nodes.length,
    limit: MAX_SELECTION_NODES,
  };
}

export function scopedRoots(scope = 'auto') {
  const selection = figma.currentPage.selection;
  const explicitSelection = scope === 'selection';
  const useSelection = explicitSelection || (scope !== 'page' && selection.length > 0);

  if (useSelection) {
    const nodes = selection.slice(0, MAX_SELECTION_NODES);
    if (!nodes.length) throw new SafetyError('当前没有选中图层。请使用页面范围编辑当前页面。');
    return {
      nodes,
      scope: 'selection',
      sourceCount: selection.length,
      truncated: selection.length > nodes.length,
      limit: MAX_SELECTION_NODES,
    };
  }

  return {
    nodes: figma.currentPage.children,
    scope: 'page',
    sourceCount: figma.currentPage.children.length,
    truncated: false,
    limit: MAX_CANVAS_NODES,
  };
}
