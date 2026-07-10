import { SafetyError } from '../../shared/errors.js';
import {
  compactTargetText,
  matchesTargetQuery,
  normalizeDuplicateTargetQuery,
} from '../../shared/target-utils.js';
import {
  collectNodesAsync,
  MAX_CANVAS_NODES,
  resolveExplicitTargets,
  scopedRoots,
  summarizeNode,
} from '../selection.js';
import { rethrowCancellationOrSafety, runNodeBatch } from './batch-operation.js';

const MAX_DUPLICATE_TARGETS = 20;
const DUPLICATE_GAP = 48;
const DUPLICATE_MAX_PLACEMENT_ATTEMPTS = 240;

export async function duplicateLayers(args = {}, context) {
  const targets = await resolveDuplicateTargets(args, context);
  const options = normalizeDuplicateOptions(args);
  assertSafeDuplicate(targets, options);

  const occupancy = createOccupancy(targets.nodes);
  const placementGroups = new Map();
  const jobs = targets.nodes.flatMap((node) =>
    Array.from({ length: options.count }, (_, index) => ({
      id: node.id,
      name: node.name,
      node,
      index,
    })),
  );
  const { skipped, values: copies } = await runNodeBatch(
    jobs,
    context,
    (job) => {
      const nodeOptions = {
        ...options,
        layout: effectiveLayout(options, job.node),
      };
      if (!placementGroups.has(job.node.id)) {
        placementGroups.set(
          job.node.id,
          findPlacementGroup(job.node, occupancyFor(job.node, occupancy), nodeOptions),
        );
      }
      const placements = placementGroups.get(job.node.id);
      return duplicateNode(job.node, occupancy, nodeOptions, job.index, placements[job.index]);
    },
    {
      shouldRethrow: rethrowCancellationOrSafety,
    },
  );

  await context?.yieldToHost();
  figma.currentPage.selection = copies;
  if (copies.length) figma.viewport.scrollAndZoomIntoView(copies);

  return {
    changed: copies.length,
    skipped,
    scope: targets.scope,
    targetQuery: targets.query,
    targetCount: copies.length,
    nodes: copies.map(summarizeNode),
    message: `已复制 ${copies.length} 个图层${targets.query ? `，匹配目标“${targets.query}”` : ''}。`,
  };
}

export async function previewDuplicateLayers(args = {}, context) {
  const targets = await resolveDuplicateTargets(args, context);
  const options = normalizeDuplicateOptions(args);
  const totalCopies = assertSafeDuplicate(targets, options);
  await context?.yieldToHost();
  selectDuplicateTargets(targets.nodes);

  return {
    preview: true,
    toolName: 'duplicate_layers',
    action: '复制图层',
    scope: targets.scope,
    sourceCount: targets.sourceCount,
    matchedCount: targets.matchedCount,
    targetQuery: targets.query,
    targetCount: targets.nodes.length,
    copyCount: totalCopies,
    nodeIds: targets.nodes.map((node) => node.id),
    nodes: targets.nodes.slice(0, 40).map(summarizeNode),
    message: `正在预览 ${targets.nodes.length} 个源图层，确认后将复制 ${totalCopies} 个图层${targets.query ? `，匹配目标“${targets.query}”` : ''}。`,
  };
}

async function resolveDuplicateTargets(args, context) {
  const explicit = resolveExplicitTargets(args, canDuplicate, {
    limit: MAX_DUPLICATE_TARGETS,
    normalizeQuery: normalizeDuplicateTargetQuery,
    checkCancelled: context?.checkCancelled,
  });
  if (explicit) return explicit;

  const roots = scopedRoots(args.scope);
  const rawTarget = String(args.target || args.targetQuery || '');
  const query = normalizeDuplicateTargetQuery(rawTarget);
  const collected = await collectNodesAsync(roots.nodes, MAX_CANVAS_NODES, {
    checkCancelled: context?.checkCancelled,
    yieldIfNeeded: context?.yieldIfNeeded,
  });

  if (roots.scope === 'selection' && (!query || isDirectSelectionDuplicateTarget(rawTarget))) {
    return {
      nodes: roots.nodes.filter(canDuplicate),
      query,
      scope: roots.scope,
      sourceCount: roots.sourceCount,
      matchedCount: roots.nodes.length,
    };
  }

  const matches = collected.nodes.filter(canDuplicate).filter((node) => duplicateMatches(node, query));

  return {
    nodes: chooseBestDuplicateMatches(matches, query),
    query,
    scope: roots.scope,
    sourceCount: roots.sourceCount,
    matchedCount: matches.length,
  };
}

function assertSafeDuplicate(targets, options) {
  const totalCopies = targets.nodes.length * options.count;
  if (!targets.nodes.length) {
    throw new SafetyError(
      `没有找到可复制图层${targets.query ? `，匹配目标“${targets.query}”` : ''}。请使用更具体的目标名称，或先选中要复制的图层。`,
    );
  }
  if (totalCopies > MAX_DUPLICATE_TARGETS) {
    throw new SafetyError(
      `已拒绝复制：这会复制 ${totalCopies} 个图层，安全上限是 ${MAX_DUPLICATE_TARGETS} 个。请减少复制数量、使用更具体的目标或更小的选区。`,
    );
  }
  return totalCopies;
}

function selectDuplicateTargets(nodes) {
  figma.currentPage.selection = nodes;
  if (nodes.length) figma.viewport.scrollAndZoomIntoView(nodes);
}

function duplicateNode(node, occupancy, options, index, groupPlacement) {
  let copy;
  try {
    copy = node.clone();
    copy.name = nextCopyName(node.name);
    placeCopyInOriginalParent(node, copy, index);

    const occupied = occupancyFor(node, occupancy);
    const placement = groupPlacement || findPlacement(node, occupied, options, index);
    if (placement && 'x' in copy && 'y' in copy) {
      copy.x = placement.x;
      copy.y = placement.y;
      occupied.push({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
    }

    return copy;
  } catch (error) {
    copy?.remove?.();
    throw error;
  }
}

function placeCopyInOriginalParent(node, copy, index) {
  const parent = node.parent;
  if (!parent || !('children' in parent) || typeof parent.insertChild !== 'function') return;

  const currentIndex = parent.children.indexOf(node);
  if (currentIndex < 0) return;

  const nextIndex = Math.min(currentIndex + index + 1, parent.children.length);
  if (copy.parent === parent && parent.children.indexOf(copy) === nextIndex) return;
  parent.insertChild(nextIndex, copy);
}

function effectiveLayout(options) {
  if (options.layout !== 'auto') return options.layout;
  if (['left', 'right'].includes(options.placement)) return 'horizontal';
  if (['top', 'bottom'].includes(options.placement)) return 'vertical';
  if (options.placement.includes('left') || options.placement.includes('right')) return 'horizontal';
  if (options.placement.includes('top') || options.placement.includes('bottom')) return 'vertical';
  return 'horizontal';
}

function createOccupancy(targets) {
  const byParent = new Map();

  for (const target of targets) {
    const parent = target.parent;
    if (!parent || !('children' in parent)) continue;
    const key = parent.id;
    if (byParent.has(key)) continue;

    byParent.set(key, parent.children.map(localBoundsOf).filter(Boolean));
  }

  return byParent;
}

function occupancyFor(node, occupancy) {
  const key = node.parent?.id;
  if (!key) return [];
  if (!occupancy.has(key)) occupancy.set(key, []);
  return occupancy.get(key);
}

function findPlacement(node, occupied, options, index) {
  const source = localBoundsOf(node);
  if (!source) return null;

  const width = source.width;
  const height = source.height;
  const origin = { x: source.x, y: source.y };
  const preferred = preferredPlacement(source, options, index);
  if (preferred) {
    const candidate = { ...preferred, width, height };
    if (!intersectsAny(candidate, occupied)) return candidate;
  }

  let attempts = 0;
  let best = null;
  for (let ring = 1; attempts < DUPLICATE_MAX_PLACEMENT_ATTEMPTS; ring++) {
    const candidates = placementRing(source, ring, options, index)
      .map((candidate) => ({ ...candidate, width, height }))
      .sort((a, b) => distanceScore(a, origin, options) - distanceScore(b, origin, options));

    for (const candidate of candidates) {
      attempts++;
      if (!intersectsAny(candidate, occupied)) return candidate;
      best = candidate;
      if (attempts >= DUPLICATE_MAX_PLACEMENT_ATTEMPTS) break;
    }
  }

  return best || { x: source.x + width + DUPLICATE_GAP, y: source.y, width, height };
}

function findPlacementGroup(node, occupied, options) {
  const source = localBoundsOf(node);
  if (!source || options.count <= 1) return [];

  const preferred = preferredPlacement(source, options, 0);
  if (preferred) {
    const group = layoutGroupFromFirst(preferred, source, options);
    if (!groupIntersectsAny(group, occupied)) return group;
  }

  let attempts = 0;
  let best = null;
  for (let ring = 1; attempts < DUPLICATE_MAX_PLACEMENT_ATTEMPTS; ring++) {
    const origin = { x: source.x, y: source.y };
    const candidates = placementRing(source, ring, options, 0).sort(
      (a, b) => distanceScore(a, origin, options) - distanceScore(b, origin, options),
    );

    for (const first of candidates) {
      attempts++;
      const group = layoutGroupFromFirst(first, source, options);
      if (!groupIntersectsAny(group, occupied)) return group;
      best = group;
      if (attempts >= DUPLICATE_MAX_PLACEMENT_ATTEMPTS) break;
    }
  }

  return best || [];
}

function layoutGroupFromFirst(first, source, options) {
  const stepX = source.width + DUPLICATE_GAP;
  const stepY = source.height + DUPLICATE_GAP;
  return Array.from({ length: options.count }, (_, index) => ({
    ...applyLayoutOffset(first, options.layout, index, stepX, stepY),
    width: source.width,
    height: source.height,
  }));
}

function preferredPlacement(source, options, index) {
  if (!options.placement || options.placement === 'auto') return null;

  const stepX = source.width + DUPLICATE_GAP;
  const stepY = source.height + DUPLICATE_GAP;
  const base = placementBase(source, options.placement, stepX, stepY);
  return applyLayoutOffset(base, options.layout, index, stepX, stepY);
}

function placementRing(source, ring, options, index) {
  const stepX = source.width + DUPLICATE_GAP;
  const stepY = source.height + DUPLICATE_GAP;
  const out = [];

  if (options.placement && options.placement !== 'auto') {
    out.push(...preferredFallbackPositions(source, options, index, ring, stepX, stepY));
  }

  out.push({ x: source.x + stepX * ring, y: source.y });
  out.push({ x: source.x, y: source.y + stepY * ring });
  out.push({ x: source.x - stepX * ring, y: source.y });
  out.push({ x: source.x, y: source.y - stepY * ring });

  for (let offset = 1; offset <= ring; offset++) {
    out.push({ x: source.x + stepX * ring, y: source.y + stepY * offset });
    out.push({ x: source.x + stepX * ring, y: source.y - stepY * offset });
    out.push({ x: source.x - stepX * ring, y: source.y + stepY * offset });
    out.push({ x: source.x - stepX * ring, y: source.y - stepY * offset });
    out.push({ x: source.x + stepX * offset, y: source.y + stepY * ring });
    out.push({ x: source.x - stepX * offset, y: source.y + stepY * ring });
    out.push({ x: source.x + stepX * offset, y: source.y - stepY * ring });
    out.push({ x: source.x - stepX * offset, y: source.y - stepY * ring });
  }

  return uniquePositions(out);
}

function placementBase(source, placement, stepX, stepY) {
  const positions = {
    right: { x: source.x + stepX, y: source.y },
    left: { x: source.x - stepX, y: source.y },
    bottom: { x: source.x, y: source.y + stepY },
    top: { x: source.x, y: source.y - stepY },
    'bottom-left': { x: source.x - stepX, y: source.y + stepY },
    'bottom-right': { x: source.x + stepX, y: source.y + stepY },
    'top-left': { x: source.x - stepX, y: source.y - stepY },
    'top-right': { x: source.x + stepX, y: source.y - stepY },
  };
  return positions[placement] || positions.right;
}

function preferredFallbackPositions(source, options, index, ring, stepX, stepY) {
  const placement = options.placement;
  const layout = options.layout;
  const out = [];

  if (layout === 'vertical') {
    const x = placement.includes('left')
      ? source.x - stepX * ring
      : placement.includes('right')
        ? source.x + stepX * ring
        : source.x;
    const yDirection = placement.includes('top') ? -1 : 1;
    const yStart = placement.includes('top') || placement.includes('bottom') ? ring : 1;
    out.push({ x, y: source.y + yDirection * stepY * (yStart + index) });

    if (placement.includes('left') || placement.includes('right')) {
      const fixedX = placement.includes('left') ? source.x - stepX : source.x + stepX;
      out.push({ x: fixedX, y: source.y + yDirection * stepY * (ring + index) });
    }
    return uniquePositions(out);
  }

  if (layout === 'horizontal') {
    const xDirection = placement.includes('left') ? -1 : 1;
    const xStart = placement.includes('left') || placement.includes('right') ? ring : 1;
    const y = placement.includes('top')
      ? source.y - stepY * ring
      : placement.includes('bottom')
        ? source.y + stepY * ring
        : source.y;
    out.push({ x: source.x + xDirection * stepX * (xStart + index), y });

    if (placement.includes('top') || placement.includes('bottom')) {
      const fixedY = placement.includes('top') ? source.y - stepY : source.y + stepY;
      out.push({ x: source.x + xDirection * stepX * (ring + index), y: fixedY });
    }
    return uniquePositions(out);
  }

  const base = placementBase(source, placement, stepX * ring, stepY * ring);
  out.push(applyLayoutOffset(base, layout, index, stepX, stepY));
  return uniquePositions(out);
}

function applyLayoutOffset(base, layout, index, stepX, stepY) {
  if (layout === 'vertical') return { x: base.x, y: base.y + index * stepY };
  if (layout === 'horizontal') return { x: base.x + index * stepX, y: base.y };
  return { x: base.x + index * stepX, y: base.y };
}

function distanceScore(candidate, origin, options) {
  const dx = candidate.x - origin.x;
  const dy = candidate.y - origin.y;
  const directionBias = directionScore(candidate, origin, options);
  return Math.sqrt(dx * dx + dy * dy) + directionBias;
}

function directionScore(candidate, origin, options) {
  if (!options.placement || options.placement === 'auto') return candidate.x >= origin.x ? 0 : 0.15;
  const wantsLeft = options.placement.includes('left');
  const wantsRight = options.placement.includes('right');
  const wantsBottom = options.placement.includes('bottom') || options.placement === 'bottom';
  const wantsTop = options.placement.includes('top') || options.placement === 'top';
  const matchesX =
    (!wantsLeft && !wantsRight) ||
    (wantsLeft && candidate.x < origin.x) ||
    (wantsRight && candidate.x > origin.x);
  const matchesY =
    (!wantsBottom && !wantsTop) ||
    (wantsBottom && candidate.y > origin.y) ||
    (wantsTop && candidate.y < origin.y);
  return matchesX && matchesY ? 0 : 200;
}

function uniquePositions(positions) {
  const out = [];
  const seen = new Set();
  for (const position of positions) {
    const key = `${position.x}:${position.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(position);
  }
  return out;
}

function intersectsAny(candidate, boxes) {
  return boxes.some((box) => intersects(candidate, box, DUPLICATE_GAP / 2));
}

function groupIntersectsAny(group, boxes) {
  return group.some((candidate, index) => {
    const earlier = group.slice(0, index);
    return (
      intersectsAny(candidate, boxes) || earlier.some((box) => intersects(candidate, box, DUPLICATE_GAP / 2))
    );
  });
}

function intersects(a, b, padding = 0) {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

function localBoundsOf(node) {
  if ('x' in node && 'y' in node && 'width' in node && 'height' in node) {
    return { x: node.x, y: node.y, width: node.width, height: node.height };
  }
  return null;
}

function chooseBestDuplicateMatches(nodes, query) {
  if (!query) return nodes;

  const exact = nodes.filter((node) => normalizeDuplicateTargetQuery(node.name) === query);
  if (exact.length) return exact;

  const compactQuery = compactTargetText(query);
  const compactExact = nodes.filter((node) => compactTargetText(node.name) === compactQuery);
  if (compactExact.length) return compactExact;

  return nodes;
}

function duplicateMatches(node, query) {
  return matchesTargetQuery(node.name, query, { normalizeQuery: normalizeDuplicateTargetQuery });
}

function canDuplicate(node) {
  return node && typeof node.clone === 'function' && node.type !== 'PAGE' && node.type !== 'DOCUMENT';
}

function nextCopyName(name) {
  const base = String(name || '未命名图层').replace(/\s+副本(?:\s+\d+)?$/i, '');
  return `${base} 副本`;
}

function normalizeDuplicateOptions(args) {
  return {
    count: clampInteger(args.count, 1, MAX_DUPLICATE_TARGETS, 1),
    placement: normalizePlacement(args.placement),
    layout: normalizeLayout(args.layout),
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizePlacement(value) {
  const placement = String(value || 'auto');
  return [
    'auto',
    'right',
    'left',
    'top',
    'bottom',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ].includes(placement)
    ? placement
    : 'auto';
}

function normalizeLayout(value) {
  const layout = String(value || 'auto');
  return ['auto', 'horizontal', 'vertical'].includes(layout) ? layout : 'auto';
}

function isDirectSelectionDuplicateTarget(value) {
  const raw = String(value || '');
  if (!/选中|所选|当前选区|selected|selection|current/i.test(raw)) return false;
  return !normalizeDuplicateTargetQuery(raw);
}
