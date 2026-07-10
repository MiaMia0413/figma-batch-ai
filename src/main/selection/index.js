export {
  MAX_CANVAS_NODES,
  MAX_CONTROL_DESCENDANT_NODES,
  MAX_QA_NODES,
  MAX_SELECTION_NODES,
  MAX_TEXT_SCAN_NODES,
} from './limits.js';
export { limitedSelection, scopedRoots } from './scope.js';
export { collectNodes, collectNodesAsync, summarizeNode } from './traverse.js';
export { resolveExplicitTargets } from './explicit-targets.js';
export { matchesNodeQuery, resolveTargets } from './basic-match.js';
