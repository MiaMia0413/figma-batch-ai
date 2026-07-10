import {
  hasControlTargetIntent,
  matchesTargetQuery,
  normalizeTargetQuery,
} from '../../shared/target-utils.js';

export function normalizeSemanticQuery(value) {
  return normalizeTargetQuery(value, { stripPossessive: true });
}

export function semanticMatches(node, query) {
  return matchesTargetQuery([node.name, 'characters' in node ? node.characters : ''], query, {
    normalizeQuery: normalizeSemanticQuery,
  });
}

export function semanticTargetKind(args, rawTarget, action) {
  if (args.targetKind) return args.targetKind;
  if (action === 'text') return 'text-replacement';
  if (action === 'background' && hasControlTargetIntent(rawTarget)) return 'control';
  return action;
}

export function isDirectSelectionTarget(value) {
  const raw = String(value || '');
  if (!/选中|所选|当前选区|selected|selection|current/i.test(raw)) return false;

  const rest = raw
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/当前选区|选中的|选中|所选|当前|selected|selection|current/g, ' ')
    .replace(/的|里面|内部|中|里/g, ' ')
    .replace(
      /\b(layer|layers|frame|frames|module|modules|element|elements|content|contents|object|objects|node|nodes)\b/g,
      ' ',
    )
    .replace(/图层|画板|框架|模块|元素|内容|对象|节点|组件|容器|背景色|底色|填充色|填充|背景/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return rest === '';
}

export function hasSolidFill(node) {
  return (
    'fills' in node &&
    Array.isArray(node.fills) &&
    node.fills.some((fill) => fill.type === 'SOLID' && fill.visible !== false)
  );
}

export function nearestMeaningfulContainer(node) {
  let current = node.parent;
  let best = null;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    best = current;
    if (hasSolidFill(current) || ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(current.type))
      return current;
    current = current.parent;
  }

  return best;
}

export function nearestPredicateAncestor(node, predicate) {
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

export function isAncestor(ancestor, node) {
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

export function addUnique(out, seen, node) {
  if (!node || seen.has(node.id)) return;
  seen.add(node.id);
  out.push(node);
}

export function uniqueNodes(nodes) {
  const out = [];
  const seen = new Set();
  for (const node of nodes) addUnique(out, seen, node);
  return out;
}
