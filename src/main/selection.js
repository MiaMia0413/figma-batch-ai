import { rgbToHex, round } from './utils.js';

export const MAX_SELECTION_NODES = 200;
export const MAX_QA_NODES = 350;
export const MAX_CANVAS_NODES = 900;
export const MAX_CONTROL_DESCENDANT_NODES = 2500;
export const MAX_TEXT_SCAN_NODES = 6000;

const CONTROL_INTENT_RE = /\b(button|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|list item|list items|menu item|menu items|nav item|nav items|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/i;
const TARGET_QUALIFIER_RE = /全部|所有|当前|选中|图层|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/g;

export function limitedSelection() {
  const selection = figma.currentPage.selection;
  const nodes = selection.slice(0, MAX_SELECTION_NODES);
  if (!nodes.length) throw new Error('当前没有选中图层。请使用页面范围编辑当前页面。');
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
    if (!nodes.length) throw new Error('当前没有选中图层。请使用页面范围编辑当前页面。');
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

export function resolveTargets(args, predicate, options = {}) {
  const explicit = explicitNodeTargets(args, predicate, options);
  if (explicit) return explicit;

  const roots = scopedRoots(args.scope);
  const collected = collectNodes(roots.nodes, options.limit || MAX_CANVAS_NODES);
  const query = normalizeQuery(args.target || args.targetQuery || '');
  const matched = query
    ? collected.nodes.filter((node) => matchesQuery(node, query))
    : collected.nodes;
  const searchRoots = query ? expandMatchedRoots(matched) : collected.nodes;
  const candidates = [];
  const seen = new Set();

  for (const root of searchRoots) {
    const nodes = query ? collectNodes([root], options.limit || MAX_CANVAS_NODES).nodes : [root];
    for (const node of nodes) {
      if (seen.has(node.id) || !predicate(node)) continue;
      seen.add(node.id);
      candidates.push(node);
    }
  }

  return {
    nodes: candidates,
    query,
    matchedCount: matched.length,
    scope: roots.scope,
    sourceCount: roots.sourceCount,
    truncated: roots.truncated || collected.truncated,
    limit: collected.limit,
  };
}

export function resolveBackgroundTargets(args, predicate, options = {}) {
  const explicit = explicitNodeTargets(args, predicate, options);
  if (explicit) return explicit;

  const roots = scopedRoots(args.scope);
  const collected = collectNodes(roots.nodes, options.limit || MAX_CANVAS_NODES);
  const rawTarget = String(args.target || args.targetQuery || '');
  const query = normalizeQuery(rawTarget);

  if (!query) return resolveTargets(args, predicate, options);

  const matched = collected.nodes.filter((node) => matchesQuery(node, query));
  const controlIntent = isControlTarget(rawTarget) || args.targetKind === 'control';
  const controlTargets = controlIntent
    ? backgroundTargetsFromControlMatches(collected.nodes, matched, query, predicate)
    : [];
  const candidates = [];
  const seen = new Set();

  for (const background of controlTargets) {
    if (!background || seen.has(background.id)) continue;
    seen.add(background.id);
    candidates.push(background);
  }

  const rootsToSearch = controlIntent || candidates.length ? [] : expandMatchedRoots(matched);
  for (const root of rootsToSearch) {
    const background = bestBackgroundCandidate(root, predicate);
    if (!background || seen.has(background.id)) continue;
    seen.add(background.id);
    candidates.push(background);
  }

  return {
    nodes: candidates,
    query,
    matchedCount: controlTargets.length || matched.length,
    searchMatchCount: matched.length,
    targetKind: controlIntent ? 'control' : 'layer',
    scope: roots.scope,
    sourceCount: roots.sourceCount,
    truncated: roots.truncated || collected.truncated,
    limit: collected.limit,
  };
}

function explicitNodeTargets(args, predicate, options = {}) {
  if (!Array.isArray(args.nodeIds) || !args.nodeIds.length) return null;

  const nodes = [];
  const seen = new Set();
  const limit = options.limit || MAX_CANVAS_NODES;
  const wanted = new Set(args.nodeIds.slice(0, limit).map(String));
  const scanLimit = Math.max(MAX_CANVAS_NODES, args.nodeIds.length * 20);

  for (const node of [...figma.currentPage.selection, ...collectNodes(figma.currentPage.children, scanLimit).nodes]) {
    if (!wanted.has(node.id) || seen.has(node.id) || !predicate(node)) continue;
    seen.add(node.id);
    nodes.push(node);
    if (nodes.length === wanted.size) break;
  }

  return {
    nodes,
    query: normalizeQuery(args.target || args.targetQuery || ''),
    matchedCount: nodes.length,
    scope: 'preview',
    sourceCount: args.nodeIds.length,
    truncated: args.nodeIds.length > limit,
    limit,
  };
}

export function collectNodes(roots, limit) {
  const out = [];
  const queue = [...roots];

  while (queue.length && out.length < limit) {
    const node = queue.shift();
    out.push(node);
    if ('children' in node) queue.push(...node.children);
  }

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
  if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) summary.cornerRadius = node.cornerRadius;

  return summary;
}

function matchesQuery(node, query) {
  const haystack = [
    node.name,
    'characters' in node ? node.characters : '',
  ].map(normalizeQuery).join(' ');

  if (!query) return true;
  if (haystack.includes(query)) return true;

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part));
}

function expandMatchedRoots(nodes) {
  const roots = [];
  const seen = new Set();

  for (const node of nodes) {
    for (const root of [node, nearestEditableContainer(node)]) {
      if (!root || seen.has(root.id)) continue;
      seen.add(root.id);
      roots.push(root);
    }
  }

  return roots;
}

function nearestEditableContainer(node) {
  const parent = node.parent;
  if (!parent || parent.type === 'PAGE' || parent.type === 'DOCUMENT') return null;
  return parent;
}

function backgroundTargetsFromControlMatches(nodes, matched, query, predicate) {
  const out = [];
  const seenText = new Set();
  const seenBackground = new Set();

  for (const node of nodes) {
    addBackgroundFromTextNode(node, query, predicate, out, seenText, seenBackground);
  }

  if (out.length) return out;

  for (const root of expandMatchedRoots(matched)) {
    for (const node of collectNodes([root], MAX_CONTROL_DESCENDANT_NODES).nodes) {
      addBackgroundFromTextNode(node, query, predicate, out, seenText, seenBackground);
    }
  }

  return out;
}

function addBackgroundFromTextNode(node, query, predicate, out, seenText, seenBackground) {
  if (node.type !== 'TEXT' || !matchesQuery(node, query)) return;
  if (seenText.has(node.id)) return;
  seenText.add(node.id);

  const background = nearestTextBackground(node, predicate);
  if (!background || seenBackground.has(background.id)) return;
  seenBackground.add(background.id);
  out.push(background);
}

function nearestTextBackground(textNode, predicate) {
  let container = textNode.parent;

  while (container && container.type !== 'PAGE' && container.type !== 'DOCUMENT') {
    const background = bestTextBackgroundCandidate(container, textNode, predicate);
    if (background) return background;
    container = container.parent;
  }

  return null;
}

function bestTextBackgroundCandidate(container, textNode, predicate) {
  const nodes = collectNodes([container], MAX_CANVAS_NODES).nodes;
  const candidates = nodes
    .filter((node) => predicate(node) && node.type !== 'TEXT')
    .map((node) => ({ node, score: textBackgroundScore(node, textNode, container) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.node || null;
}

function bestBackgroundCandidate(root, predicate) {
  const candidates = collectNodes([root], MAX_CANVAS_NODES).nodes
    .filter((node) => predicate(node) && node.type !== 'TEXT');

  if (!candidates.length) return null;

  return candidates
    .map((node) => ({ node, score: backgroundScore(node, root) }))
    .sort((a, b) => b.score - a.score)[0].node;
}

function backgroundScore(node, root) {
  const area = 'width' in node && 'height' in node ? node.width * node.height : 0;
  let score = Math.min(area / 100, 10000);

  if (node === root) score += 3000;
  if (node.parent === root) score += 2000;
  if (['RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type)) score += 1000;
  if (/bg|background|底|背景|button|btn|按钮/i.test(node.name || '')) score += 1500;
  if ('fills' in node && Array.isArray(node.fills) && node.fills.some((fill) => fill.type === 'SOLID')) score += 500;

  return score;
}

function textBackgroundScore(node, textNode, container) {
  const nodeBounds = boundsOf(node);
  const textBounds = boundsOf(textNode);
  if (!nodeBounds || !textBounds) return 0;

  const nodeArea = nodeBounds.width * nodeBounds.height;
  const textArea = textBounds.width * textBounds.height;
  if (!nodeArea || !textArea || nodeArea < textArea * 0.8) return 0;

  const ratio = nodeArea / textArea;
  if (ratio > 80) return 0;

  let score = 10000 - Math.abs(ratio - 3) * 300;
  if (containsBounds(nodeBounds, textBounds)) score += 8000;
  else if (intersectsBounds(nodeBounds, textBounds)) score += 3500;
  else return 0;

  if (node.parent === container) score += 2500;
  if (['RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type)) score += 1200;
  if (/bg|background|底|背景|button|btn|按钮/i.test(node.name || '')) score += 1500;
  if ('fills' in node && Array.isArray(node.fills) && node.fills.some((fill) => fill.type === 'SOLID')) score += 600;

  return score;
}

function boundsOf(node) {
  if (node.absoluteBoundingBox) return node.absoluteBoundingBox;
  if ('width' in node && 'height' in node) {
    return { x: 0, y: 0, width: node.width, height: node.height };
  }
  return null;
}

function containsBounds(outer, inner) {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height;
}

function intersectsBounds(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function isControlTarget(value) {
  return CONTROL_INTENT_RE.test(String(value || ''));
}

function normalizeQuery(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[#'"]/g, '')
    .replace(/\b(all|every|the|selected|current|layer|layers|button|buttons|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b/g, ' ')
    .replace(TARGET_QUALIFIER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
