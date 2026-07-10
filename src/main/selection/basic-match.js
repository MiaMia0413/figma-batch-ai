import { matchesTargetQuery, normalizeTargetQuery } from '../../shared/target-utils.js';
import { resolveExplicitTargets } from './explicit-targets.js';
import { MAX_CANVAS_NODES } from './limits.js';
import { scopedRoots } from './scope.js';
import { collectNodesAsync } from './traverse.js';

export async function resolveTargets(args, predicate, options = {}) {
  const explicit = resolveExplicitTargets(args, predicate, options);
  if (explicit) return explicit;

  const roots = scopedRoots(args.scope);
  const collected = await collectNodesAsync(roots.nodes, options.limit || MAX_CANVAS_NODES, options);
  const query = normalizeTargetQuery(args.target || args.targetQuery || '');
  const matched = query ? collected.nodes.filter((node) => matchesNodeQuery(node, query)) : collected.nodes;
  const searchRoots = query ? expandMatchedRoots(matched) : collected.nodes;
  const candidates = [];
  const seen = new Set();

  for (const root of searchRoots) {
    const nodes = query
      ? (await collectNodesAsync([root], options.limit || MAX_CANVAS_NODES, options)).nodes
      : [root];
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

export function matchesNodeQuery(node, query) {
  return matchesTargetQuery([node.name, 'characters' in node ? node.characters : ''], query);
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
