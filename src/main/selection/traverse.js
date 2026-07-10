import { rgbToHex, round } from '../utils.js';

export function collectNodes(roots, limit, options = {}) {
  const out = [];
  const queue = [...roots];
  let visited = 0;

  while (queue.length && out.length < limit) {
    const node = queue.shift();
    out.push(node);
    if ('children' in node) queue.push(...node.children);
    visited++;
    if (visited % 100 === 0) options.checkCancelled?.();
  }

  options.checkCancelled?.();
  return {
    nodes: out,
    truncated: queue.length > 0,
    limit,
  };
}

export async function collectNodesAsync(roots, limit, context = {}) {
  const out = [];
  const queue = [...roots];

  while (queue.length && out.length < limit) {
    await context.yieldIfNeeded?.();
    const node = queue.shift();
    out.push(node);
    if ('children' in node) queue.push(...node.children);
  }

  context.checkCancelled?.();
  return {
    nodes: out,
    truncated: queue.length > 0,
    limit,
  };
}

export function summarizeNode(node) {
  const summary = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ('width' in node) summary.width = round(node.width);
  if ('height' in node) summary.height = round(node.height);
  if ('characters' in node) summary.text = node.characters.slice(0, 160);
  if ('fills' in node && Array.isArray(node.fills)) {
    summary.fills = node.fills
      .filter((fill) => fill.type === 'SOLID')
      .slice(0, 3)
      .map((fill) => rgbToHex(fill.color));
  }
  if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) {
    summary.cornerRadius = node.cornerRadius;
  }

  return summary;
}
