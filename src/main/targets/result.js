import { uniqueNodes } from './common.js';

export function semanticResult({
  nodes,
  query,
  roots,
  collected,
  matchedCount,
  searchMatchCount,
  targetKind,
  strategy,
}) {
  return {
    nodes: uniqueNodes(nodes),
    query,
    matchedCount,
    searchMatchCount,
    targetKind,
    strategy,
    scope: roots.scope,
    sourceCount: roots.sourceCount,
    truncated: roots.truncated || collected.truncated,
    limit: collected.limit,
  };
}
