import { SafetyError } from '../../shared/errors.js';
import { normalizeTargetQuery } from '../../shared/target-utils.js';
import { MAX_CANVAS_NODES } from './limits.js';
import { collectNodes } from './traverse.js';

export async function resolveExplicitTargets(args, predicate, options = {}) {
  if (!Array.isArray(args.nodeIds) || !args.nodeIds.length) return null;

  const limit = options.limit || MAX_CANVAS_NODES;
  const requestedIds = [...new Set(args.nodeIds.slice(0, limit).map(String))];
  const wanted = new Set(requestedIds);
  const scanLimit = Math.max(options.scanFloor || MAX_CANVAS_NODES, args.nodeIds.length * 20);
  const sourcesById = await explicitSourcesById(requestedIds, scanLimit, options);
  const nodes = requestedIds
    .map((id) => sourcesById.get(id))
    .filter((node) => node && belongsToCurrentPage(node) && predicate(node));

  if (nodes.length !== wanted.size) {
    const resolved = new Set(nodes.map((node) => node.id));
    const missingNodeIds = requestedIds.filter((id) => !resolved.has(id));
    throw new SafetyError('预览目标已发生变化，请重新预览后再执行。', {
      details: { missingNodeIds },
    });
  }

  return {
    nodes,
    query: (options.normalizeQuery || normalizeTargetQuery)(args.target || args.targetQuery || ''),
    matchedCount: nodes.length,
    searchMatchCount: nodes.length,
    targetKind: options.targetKind || args.targetKind || 'preview',
    strategy: 'preview-node-ids',
    scope: 'preview',
    sourceCount: args.nodeIds.length,
    truncated: args.nodeIds.length > limit,
    limit,
  };
}

async function explicitSourcesById(requestedIds, scanLimit, options) {
  if (typeof figma.getNodeByIdAsync === 'function') {
    const resolved = await Promise.all(requestedIds.map((id) => figma.getNodeByIdAsync(id)));
    options.checkCancelled?.();
    return new Map(requestedIds.map((id, index) => [id, resolved[index]]).filter(([, node]) => node));
  }

  if (typeof figma.getNodeById === 'function') {
    return new Map(requestedIds.map((id) => [id, figma.getNodeById(id)]).filter(([, node]) => node));
  }

  const sources = [
    ...figma.currentPage.selection,
    ...collectNodes(figma.currentPage.children, scanLimit, options).nodes,
  ];
  return new Map(sources.filter((node) => requestedIds.includes(node.id)).map((node) => [node.id, node]));
}

function belongsToCurrentPage(node) {
  const page = pageOf(node);
  return !page || page === figma.currentPage;
}

function pageOf(node) {
  let current = node;
  while (current?.parent && current.parent.type !== 'DOCUMENT') current = current.parent;
  return current?.type === 'PAGE' ? current : null;
}
