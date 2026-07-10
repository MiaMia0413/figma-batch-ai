import {
  MAX_CANVAS_NODES,
  MAX_TEXT_SCAN_NODES,
  collectNodesAsync,
  resolveExplicitTargets,
  scopedRoots,
} from '../selection.js';
import { collectSemanticAnchors } from './anchors.js';
import { resolveBackgroundNodes, resolveDirectSelectionNodes } from './background.js';
import { isDirectSelectionTarget, normalizeSemanticQuery, semanticTargetKind } from './common.js';
import {
  resolveContainerNodes,
  resolveLayerNodes,
  resolveTextDescendantNodes,
} from './container-text-role.js';
import { semanticResult } from './result.js';

const SEMANTIC_SCAN_LIMIT = Math.max(MAX_TEXT_SCAN_NODES, 12000);

export async function resolveSemanticTargets(args, action, predicate, options = {}) {
  const explicit = resolveExplicitTargets(args, predicate, {
    ...options,
    limit: options.limit || SEMANTIC_SCAN_LIMIT,
    scanFloor: SEMANTIC_SCAN_LIMIT,
    normalizeQuery: normalizeSemanticQuery,
  });
  if (explicit) return explicit;

  const roots = scopedRoots(args.scope);
  const limit = options.limit || semanticLimitFor(action);
  const collected = await collectNodesAsync(roots.nodes, limit, options);
  const rawTarget = String(args.target || args.targetQuery || '');
  const query = normalizeSemanticQuery(rawTarget);

  if (action === 'text-descendant') {
    const nodes = resolveTextDescendantNodes(collected.nodes, args, predicate);
    return semanticResult({
      nodes,
      query,
      roots,
      collected,
      matchedCount: nodes.length,
      searchMatchCount: nodes.length,
      targetKind: 'text',
      strategy: 'container-text-descendant',
    });
  }

  if (
    roots.scope === 'selection' &&
    isDirectSelectionTarget(rawTarget) &&
    ['background', 'layer', 'container'].includes(action)
  ) {
    return semanticResult({
      nodes: resolveDirectSelectionNodes(roots.nodes, action, predicate),
      query,
      roots,
      collected,
      matchedCount: roots.nodes.length,
      searchMatchCount: roots.nodes.length,
      targetKind: semanticTargetKind(args, rawTarget, action),
      strategy: 'direct-selection',
    });
  }

  if (!query) {
    return semanticResult({
      nodes: collected.nodes.filter(predicate),
      query,
      roots,
      collected,
      matchedCount: collected.nodes.length,
      searchMatchCount: collected.nodes.length,
      targetKind: action,
      strategy: 'all-editable',
    });
  }

  const anchors = collectSemanticAnchors(collected.nodes, query);
  const targetKind = semanticTargetKind(args, rawTarget, action);
  let nodes;
  let strategy;

  if (action === 'text') {
    nodes = anchors.text.filter(predicate);
    strategy = 'text-content';
  } else if (action === 'background') {
    nodes = resolveBackgroundNodes(anchors, predicate);
    strategy = 'text-anchor-background';
  } else if (action === 'container') {
    nodes = resolveContainerNodes(anchors, predicate);
    strategy = 'semantic-container';
  } else {
    nodes = resolveLayerNodes(anchors, predicate);
    strategy = 'semantic-layer';
  }

  return semanticResult({
    nodes,
    query,
    roots,
    collected,
    matchedCount: anchors.total,
    searchMatchCount: anchors.name.length + anchors.text.length,
    targetKind,
    strategy,
  });
}

function semanticLimitFor(action) {
  if (
    action === 'text' ||
    action === 'text-descendant' ||
    action === 'background' ||
    action === 'container'
  ) {
    return SEMANTIC_SCAN_LIMIT;
  }
  return MAX_CANVAS_NODES;
}
