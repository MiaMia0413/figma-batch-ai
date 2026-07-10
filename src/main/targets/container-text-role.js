import { compactTargetText } from '../../shared/target-utils.js';
import { MAX_CONTROL_DESCENDANT_NODES, collectNodes } from '../selection.js';
import { collectSemanticAnchors } from './anchors.js';
import {
  addUnique,
  hasSolidFill,
  isAncestor,
  nearestMeaningfulContainer,
  nearestPredicateAncestor,
  normalizeSemanticQuery,
  semanticMatches,
  uniqueNodes,
} from './common.js';
import { bucket, clamp01, semanticBoundsOf } from './geometry.js';

export function resolveTextDescendantNodes(nodes, args, predicate) {
  const containerQuery = normalizeSemanticQuery(args.containerTarget || '');
  const targetQuery = normalizeSemanticQuery(args.target || args.targetQuery || '');
  const out = [];
  const seen = new Set();

  if (!containerQuery) {
    return nodes.filter(
      (node) => node.type === 'TEXT' && predicate(node) && semanticMatches(node, targetQuery),
    );
  }

  const containerAnchors = collectSemanticAnchors(nodes, containerQuery);
  const namedContainers = editableContainers(containerAnchors.name);
  const structuralContainers = editableContainers(containerAnchors.structural);
  const containers = innermostContainers(namedContainers.length ? namedContainers : structuralContainers);

  if (isTitleQuery(targetQuery)) {
    const roleContainers = roleScopeContainers(containers, 'title');
    const groups = roleContainers.map((container) => {
      const descendants = collectNodes([container], MAX_CONTROL_DESCENDANT_NODES).nodes;
      const textNodes = descendants.filter((node) => node.type === 'TEXT' && predicate(node));
      const directMatches = textNodes.filter((node) => semanticMatches(node, targetQuery));
      return { container, textNodes, directMatches };
    });
    for (const node of bestRoleTextCandidates(groups, 'title')) addUnique(out, seen, node);
    return out;
  }

  for (const container of containers) {
    const descendants = collectNodes([container], MAX_CONTROL_DESCENDANT_NODES).nodes;
    const textNodes = descendants.filter((node) => node.type === 'TEXT' && predicate(node));
    const directMatches = textNodes.filter((node) => semanticMatches(node, targetQuery));
    for (const node of directMatches) addUnique(out, seen, node);
  }
  return out;
}

export function resolveContainerNodes(anchors, predicate) {
  const out = [];
  const seen = new Set();

  for (const anchor of anchors.name) {
    const container = predicate(anchor) ? anchor : nearestPredicateAncestor(anchor, predicate);
    if (container) addUnique(out, seen, container);
  }
  for (const textNode of anchors.text) {
    const container = nearestMeaningfulContainer(textNode);
    if (container && predicate(container)) addUnique(out, seen, container);
    else {
      const ancestor = nearestPredicateAncestor(textNode, predicate);
      if (ancestor) addUnique(out, seen, ancestor);
    }
  }
  return out.length ? out : resolveLayerNodes(anchors, predicate);
}

export function resolveLayerNodes(anchors, predicate) {
  const out = [];
  const seen = new Set();

  for (const anchor of anchors.all) {
    if (predicate(anchor)) addUnique(out, seen, anchor);
  }
  if (out.length) return out;

  for (const anchor of anchors.all) {
    const descendants = collectNodes([anchor], MAX_CONTROL_DESCENDANT_NODES).nodes;
    for (const node of descendants) {
      if (predicate(node)) addUnique(out, seen, node);
    }
  }
  return out;
}

function bestRoleTextCandidates(groups, role) {
  const records = roleCandidateRecords(groups, role);
  if (!records.length) return [];
  const cluster = bestRoleCluster(records);
  const recordsByContainer = new Map();
  const selected = [];

  for (const record of records) {
    if (!recordsByContainer.has(record.container.id)) recordsByContainer.set(record.container.id, []);
    recordsByContainer.get(record.container.id).push(record);
  }
  for (const group of groups) {
    const containerRecords = recordsByContainer.get(group.container.id) || [];
    const clustered = containerRecords.filter((record) => record.clusterKey === cluster.key);
    const candidates = clustered.length ? clustered : containerRecords;
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    if (best) selected.push(best.node);
  }
  return selected;
}

function roleCandidateRecords(groups, role) {
  const out = [];
  for (const group of groups) {
    const visibleText = group.textNodes.filter((node) => node.visible !== false);
    const directIds = new Set(group.directMatches.map((node) => node.id));
    const fontSizes = visibleText.map(numericFontSize).filter(Boolean);
    const maxFontSize = fontSizes.length ? Math.max(...fontSizes) : 0;
    const minFontSize = fontSizes.length ? Math.min(...fontSizes) : 0;

    for (const node of visibleText) {
      const features = textRoleFeatures(node, group.container, maxFontSize, minFontSize);
      if (!features) continue;
      const score = textRoleScore(features, role, directIds.has(node.id));
      if (score <= 0) continue;
      out.push({
        node,
        container: group.container,
        features,
        score,
        clusterKey: textRoleClusterKey(features),
      });
    }
  }
  return out;
}

function textRoleFeatures(node, container, maxFontSize, minFontSize) {
  const bounds = semanticBoundsOf(node);
  const containerBounds = semanticBoundsOf(container);
  if (!bounds || !containerBounds?.width || !containerBounds?.height) return null;

  const fontSize = numericFontSize(node);
  const relativeTop = clamp01((bounds.y - containerBounds.y) / containerBounds.height);
  const relativeCenter = clamp01((bounds.y + bounds.height / 2 - containerBounds.y) / containerBounds.height);
  const relativeLeft = clamp01((bounds.x - containerBounds.x) / containerBounds.width);
  const relativeWidth = clamp01(bounds.width / containerBounds.width);
  const visualSize = fontSize || bounds.height;
  const fontProminence = maxFontSize && visualSize ? visualSize / maxFontSize : 0;
  const fontSpread = Math.max(1, maxFontSize - minFontSize);
  const relativeProminence = visualSize ? (visualSize - minFontSize) / fontSpread : 0;

  return {
    node,
    bounds,
    fontSize,
    visualSize,
    relativeTop,
    relativeCenter,
    relativeLeft,
    relativeWidth,
    fontProminence,
    relativeProminence: clamp01(relativeProminence),
    compactLength: compactTargetText(textContentOf(node)).length,
    depth: depthFrom(container, node),
  };
}

function textRoleScore(features, role, directMatch) {
  if (role !== 'title') return directMatch ? 1000 : 0;

  const topScore = 1 - Math.min(features.relativeTop / 0.42, 1);
  const upperHalfScore = 1 - Math.min(features.relativeCenter / 0.62, 1);
  const hierarchyScore = Math.max(features.fontProminence, features.relativeProminence);
  const shortTextScore = features.compactLength
    ? 1 - Math.min(Math.max(features.compactLength - 18, 0) / 54, 1)
    : 0;
  const bottomPenalty =
    features.relativeCenter > 0.62 ? Math.min((features.relativeCenter - 0.62) / 0.38, 1) : 0;
  const actionAreaPenalty = features.relativeCenter > 0.68 && features.relativeWidth < 0.46 ? 1 : 0;
  const bodyTextPenalty = features.compactLength > 48 && features.fontProminence < 0.92 ? 1 : 0;
  const deepNestedPenalty = Math.min(Math.max(features.depth - 5, 0) / 6, 1);

  return Math.round(
    1800 +
      topScore * 4200 +
      upperHalfScore * 1600 +
      hierarchyScore * 3600 +
      shortTextScore * 900 +
      (directMatch ? 700 : 0) -
      bottomPenalty * 5200 -
      actionAreaPenalty * 3600 -
      bodyTextPenalty * 3000 -
      deepNestedPenalty * 900,
  );
}

function bestRoleCluster(records) {
  const clusters = new Map();
  for (const record of records) {
    const cluster = clusters.get(record.clusterKey) || {
      key: record.clusterKey,
      records: [],
      containers: new Set(),
    };
    cluster.records.push(record);
    cluster.containers.add(record.container.id);
    clusters.set(record.clusterKey, cluster);
  }
  return [...clusters.values()]
    .map((cluster) => ({ ...cluster, score: clusterScore(cluster) }))
    .sort((a, b) => b.score - a.score)[0];
}

function clusterScore(cluster) {
  const average = cluster.records.reduce((sum, record) => sum + record.score, 0) / cluster.records.length;
  const coverage = cluster.containers.size;
  const consistency = cluster.records.length / coverage;
  return average + coverage * 650 - Math.max(0, consistency - 1.4) * 300;
}

function textRoleClusterKey(features) {
  return [
    bucket(features.relativeTop, 0.08),
    bucket(features.relativeLeft, 0.12),
    bucket(features.fontProminence, 0.12),
    bucket(features.relativeWidth, 0.16),
  ].join(':');
}

function numericFontSize(node) {
  if (!('fontSize' in node) || node.fontSize === figma.mixed) return 0;
  const value = Number(node.fontSize);
  return Number.isFinite(value) ? value : 0;
}

function textContentOf(node) {
  return [node.name, 'characters' in node ? node.characters : ''].join(' ');
}

function depthFrom(ancestor, node) {
  let depth = 0;
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    depth++;
    if (current === ancestor) return depth;
    current = current.parent;
  }
  return depth;
}

function isTitleQuery(query) {
  return /标题|主标题|副标题|title|subtitle|heading/i.test(String(query || ''));
}

function roleScopeContainers(containers, role) {
  if (role !== 'title') return containers;
  const regions = [];
  for (const container of containers) regions.push(...contentRegionCandidates(container, role));
  if (!regions.length) return containers;

  const selected = [];
  for (const item of regions.sort((a, b) => b.score - a.score)) {
    if (selected.some((chosen) => isAncestor(chosen.node, item.node) || isAncestor(item.node, chosen.node)))
      continue;
    selected.push(item);
  }
  return selected.length ? selected.map((item) => item.node) : containers;
}

function contentRegionCandidates(root, role) {
  const rootBounds = semanticBoundsOf(root);
  if (!rootBounds) return [];
  return collectNodes([root], MAX_CONTROL_DESCENDANT_NODES)
    .nodes.filter((node) => node.type !== 'TEXT' && 'children' in node)
    .map((node) => ({ node, score: contentRegionScore(node, root, rootBounds, role) }))
    .filter((item) => item.score > 0);
}

function contentRegionScore(node, root, rootBounds, role) {
  const bounds = semanticBoundsOf(node);
  if (!bounds?.width || !bounds?.height) return 0;
  const textNodes = collectNodes([node], MAX_CONTROL_DESCENDANT_NODES).nodes.filter(
    (item) => item.type === 'TEXT' && item.visible !== false,
  );
  if (!textNodes.length) return 0;

  const area = bounds.width * bounds.height;
  const rootArea = rootBounds.width * rootBounds.height;
  if (!area || !rootArea) return 0;
  const isRoot = node === root;
  const areaRatio = area / rootArea;
  if (!isRoot && (areaRatio < 0.035 || areaRatio > 0.92)) return 0;

  const fontSizes = textNodes.map(numericFontSize).filter(Boolean);
  const maxFontSize = fontSizes.length ? Math.max(...fontSizes) : 0;
  const minFontSize = fontSizes.length ? Math.min(...fontSizes) : 0;
  const hasProminentTopText = textNodes.some((textNode) => {
    const features = textRoleFeatures(textNode, node, maxFontSize, minFontSize);
    return features && role === 'title' && features.relativeTop < 0.36 && features.fontProminence >= 0.92;
  });
  const surfaceScore = contentSurfaceScore(node, isRoot);
  if (!isRoot && surfaceScore <= 0 && areaRatio < 0.18) return 0;

  let score = 1000 + surfaceScore;
  if (isRoot) score += 2200;
  if (hasProminentTopText) score += 3200;
  score += Math.min(textNodes.length, 8) * 250;
  score += Math.min(area / 500, 2400);
  if (!isRoot) score -= areaRatio > 0.62 ? (areaRatio - 0.62) * 4200 : 0;
  if (!isRoot && surfaceScore <= 1200) score -= 2600;
  return score;
}

function contentSurfaceScore(node, isRoot) {
  let score = 0;
  if (hasSolidFill(node)) score += 5200;
  if (['FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type)) score += 1800;
  if (node.layoutMode && node.layoutMode !== 'NONE') score += 900;
  if (isRoot) score += 900;
  return score;
}

function editableContainers(nodes) {
  return uniqueNodes(nodes).filter((node) => node.type !== 'TEXT' && 'children' in node);
}

function innermostContainers(nodes) {
  const containers = uniqueNodes(nodes);
  return containers.filter(
    (container) => !containers.some((other) => other !== container && isAncestor(container, other)),
  );
}
