import { MAX_CANVAS_NODES, collectNodes } from '../selection.js';
import { addUnique, hasSolidFill } from './common.js';
import { semanticBoundsOf, semanticContainsBounds, semanticIntersectsBounds } from './geometry.js';

export function resolveBackgroundNodes(anchors, predicate) {
  const out = [];
  const seen = new Set();

  for (const textNode of anchors.text) {
    const background = nearestSemanticBackground(textNode, predicate);
    if (background) addUnique(out, seen, background);
  }
  if (out.length) return out;

  for (const anchor of anchors.all) {
    const background = bestSemanticSurface(anchor, predicate, anchor);
    if (background) addUnique(out, seen, background);
  }
  return out;
}

export function resolveDirectSelectionNodes(selectionNodes, action, predicate) {
  const out = [];
  const seen = new Set();

  for (const node of selectionNodes) {
    if (predicate(node)) addUnique(out, seen, node);
  }
  if (out.length || action !== 'background') return out;

  for (const node of selectionNodes) {
    const background = bestSemanticSurface(node, predicate, node);
    if (background) addUnique(out, seen, background);
  }
  return out;
}

function nearestSemanticBackground(textNode, predicate) {
  let container = textNode.parent;
  while (container && container.type !== 'PAGE' && container.type !== 'DOCUMENT') {
    const background = bestSemanticSurface(container, predicate, textNode);
    if (background) return background;
    container = container.parent;
  }
  return null;
}

function bestSemanticSurface(root, predicate, anchor) {
  const candidates = collectNodes([root], MAX_CANVAS_NODES)
    .nodes.filter((node) => node.type !== 'TEXT' && predicate(node))
    .map((node) => ({ node, score: semanticSurfaceScore(node, root, anchor) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.node || null;
}

function semanticSurfaceScore(node, root, anchor) {
  const nodeBounds = semanticBoundsOf(node);
  const anchorBounds = semanticBoundsOf(anchor);
  const nodeArea = nodeBounds ? nodeBounds.width * nodeBounds.height : 0;
  const anchorArea = anchorBounds ? anchorBounds.width * anchorBounds.height : 0;
  let score = 0;

  if (anchorBounds && nodeBounds) {
    if (!nodeArea || !anchorArea || nodeArea < anchorArea * 0.65) return 0;
    const ratio = nodeArea / anchorArea;
    if (ratio > 140) return 0;
    if (semanticContainsBounds(nodeBounds, anchorBounds)) score += 12000;
    else if (semanticIntersectsBounds(nodeBounds, anchorBounds)) score += 5000;
    else return 0;
    score += Math.max(0, 5000 - Math.abs(ratio - 4) * 180);
  } else {
    score += node === root || node.parent === root ? 2500 : 500;
  }

  if (node === root) score += 1800;
  if (node.parent === root) score += 2200;
  if (['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 'RECTANGLE'].includes(node.type)) score += 1300;
  if (hasSolidFill(node)) score += 1200;
  if (/bg|background|fill|surface|底|背景|色块|按钮|button|btn/i.test(node.name || '')) score += 900;
  if (nodeArea) score += Math.min(nodeArea / 150, 2500);
  return score;
}
