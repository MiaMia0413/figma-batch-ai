import {
  MAX_CANVAS_NODES,
  MAX_CONTROL_DESCENDANT_NODES,
  MAX_TEXT_SCAN_NODES,
  collectNodes,
  scopedRoots,
} from './selection.js';

const SEMANTIC_SCAN_LIMIT = Math.max(MAX_TEXT_SCAN_NODES, 12000);
const SEMANTIC_CONTROL_INTENT_RE = /\b(button|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|list item|list items|menu item|menu items|nav item|nav items|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/i;
const SEMANTIC_TARGET_QUALIFIER_RE = /全部|所有|当前|选中|图层|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/g;

export function resolveSemanticTargets(args, action, predicate, options = {}) {
  const explicit = resolveExplicitSemanticTargets(args, predicate, options);
  if (explicit) return explicit;

  const roots = scopedRoots(args.scope);
  const limit = options.limit || semanticLimitFor(action);
  const collected = collectNodes(roots.nodes, limit);
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

  if (roots.scope === 'selection' && isDirectSelectionTarget(rawTarget) && ['background', 'layer', 'container'].includes(action)) {
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
  if (action === 'text' || action === 'text-descendant' || action === 'background' || action === 'container') return SEMANTIC_SCAN_LIMIT;
  return MAX_CANVAS_NODES;
}

function resolveExplicitSemanticTargets(args, predicate, options = {}) {
  if (!Array.isArray(args.nodeIds) || !args.nodeIds.length) return null;

  const limit = options.limit || SEMANTIC_SCAN_LIMIT;
  const wanted = new Set(args.nodeIds.slice(0, limit).map(String));
  const scanLimit = Math.max(SEMANTIC_SCAN_LIMIT, args.nodeIds.length * 20);
  const nodes = [];
  const seen = new Set();
  const sources = [...figma.currentPage.selection, ...collectNodes(figma.currentPage.children, scanLimit).nodes];

  for (const node of sources) {
    if (!wanted.has(node.id) || seen.has(node.id) || !predicate(node)) continue;
    seen.add(node.id);
    nodes.push(node);
    if (nodes.length === wanted.size) break;
  }

  return {
    nodes,
    query: normalizeSemanticQuery(args.target || args.targetQuery || ''),
    matchedCount: nodes.length,
    searchMatchCount: nodes.length,
    targetKind: args.targetKind || 'preview',
    strategy: 'preview-node-ids',
    scope: 'preview',
    sourceCount: args.nodeIds.length,
    truncated: args.nodeIds.length > limit,
    limit,
  };
}

function collectSemanticAnchors(nodes, query) {
  const text = [];
  const name = [];
  const seenText = new Set();
  const seenName = new Set();

  for (const node of nodes) {
    if (node.type === 'TEXT' && semanticMatches(node, query)) addUnique(text, seenText, node);
    else if (semanticMatches(node, query)) addUnique(name, seenName, node);
  }

  for (const root of name) {
    const descendants = collectNodes([root], MAX_CONTROL_DESCENDANT_NODES).nodes;
    for (const node of descendants) {
      if (node.type === 'TEXT' && semanticMatches(node, query)) addUnique(text, seenText, node);
    }
  }

  const structural = collectStructuralAnchors(text, name);

  return {
    text,
    name,
    structural,
    all: uniqueNodes([...text, ...name, ...structural]),
    total: text.length + name.length + structural.length,
  };
}

function collectStructuralAnchors(textAnchors, nameAnchors) {
  const out = [];
  const seen = new Set();

  for (const node of [...textAnchors, ...nameAnchors]) {
    const container = nearestMeaningfulContainer(node);
    if (container) addUnique(out, seen, container);
  }

  return out;
}

function resolveBackgroundNodes(anchors, predicate) {
  const out = [];
  const seen = new Set();

  for (const textNode of anchors.text) {
    const background = nearestSemanticBackground(textNode, predicate);
    if (background) addUnique(out, seen, background);
  }

  if (out.length) return out;

  for (const anchor of anchors.all) {
    const background = bestSemanticSurface(anchor, predicate, anchor);
    if (background) addUnique(out, seen, background);
  }

  return out;
}

function resolveDirectSelectionNodes(selectionNodes, action, predicate) {
  const out = [];
  const seen = new Set();

  for (const node of selectionNodes) {
    if (predicate(node)) addUnique(out, seen, node);
  }

  if (out.length || action !== 'background') return out;

  for (const node of selectionNodes) {
    const background = bestSemanticSurface(node, predicate, node);
    if (background) addUnique(out, seen, background);
  }

  return out;
}

function resolveTextDescendantNodes(nodes, args, predicate) {
  const containerQuery = normalizeSemanticQuery(args.containerTarget || '');
  const targetQuery = normalizeSemanticQuery(args.target || args.targetQuery || '');
  const out = [];
  const seen = new Set();

  if (!containerQuery) {
    return nodes.filter((node) => node.type === 'TEXT' && predicate(node) && semanticMatches(node, targetQuery));
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
  const compactLength = compactSemanticText(textContentOf(node)).length;

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
    compactLength,
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
  const bottomPenalty = features.relativeCenter > 0.62
    ? Math.min((features.relativeCenter - 0.62) / 0.38, 1)
    : 0;
  const actionAreaPenalty = features.relativeCenter > 0.68 && features.relativeWidth < 0.46 ? 1 : 0;
  const bodyTextPenalty = features.compactLength > 48 && features.fontProminence < 0.92 ? 1 : 0;
  const deepNestedPenalty = Math.min(Math.max(features.depth - 5, 0) / 6, 1);

  return Math.round(
    1800
    + topScore * 4200
    + upperHalfScore * 1600
    + hierarchyScore * 3600
    + shortTextScore * 900
    + (directMatch ? 700 : 0)
    - bottomPenalty * 5200
    - actionAreaPenalty * 3600
    - bodyTextPenalty * 3000
    - deepNestedPenalty * 900
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
    .map((cluster) => ({
      ...cluster,
      score: clusterScore(cluster),
    }))
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
  return [
    node.name,
    'characters' in node ? node.characters : '',
  ].join(' ');
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

function bucket(value, size) {
  return Math.round(value / size);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isTitleQuery(query) {
  return /标题|主标题|副标题|title|subtitle|heading/i.test(String(query || ''));
}

function roleScopeContainers(containers, role) {
  if (role !== 'title') return containers;

  const regions = [];
  for (const container of containers) {
    for (const item of contentRegionCandidates(container, role)) {
      regions.push(item);
    }
  }

  if (!regions.length) return containers;

  const selected = [];
  for (const item of regions.sort((a, b) => b.score - a.score)) {
    if (selected.some((chosen) => isAncestor(chosen.node, item.node) || isAncestor(item.node, chosen.node))) continue;
    selected.push(item);
  }

  return selected.length ? selected.map((item) => item.node) : containers;
}

function contentRegionCandidates(root, role) {
  const rootBounds = semanticBoundsOf(root);
  if (!rootBounds) return [];

  return collectNodes([root], MAX_CONTROL_DESCENDANT_NODES).nodes
    .filter((node) => node.type !== 'TEXT' && 'children' in node)
    .map((node) => ({ node, score: contentRegionScore(node, root, rootBounds, role) }))
    .filter((item) => item.score > 0);
}

function contentRegionScore(node, root, rootBounds, role) {
  const bounds = semanticBoundsOf(node);
  if (!bounds?.width || !bounds?.height) return 0;

  const textNodes = collectNodes([node], MAX_CONTROL_DESCENDANT_NODES).nodes
    .filter((item) => item.type === 'TEXT' && item.visible !== false);
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

  let score = 1000;
  score += surfaceScore;
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
  return containers.filter((container) => !containers.some((other) => other !== container && isAncestor(container, other)));
}

function isAncestor(ancestor, node) {
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function resolveContainerNodes(anchors, predicate) {
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

function resolveLayerNodes(anchors, predicate) {
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

function nearestSemanticBackground(textNode, predicate) {
  let container = textNode.parent;

  while (container && container.type !== 'PAGE' && container.type !== 'DOCUMENT') {
    const background = bestSemanticSurface(container, predicate, textNode);
    if (background) return background;
    container = container.parent;
  }

  return null;
}

function bestSemanticSurface(root, predicate, anchor) {
  const nodes = collectNodes([root], MAX_CANVAS_NODES).nodes;
  const candidates = nodes
    .filter((node) => node.type !== 'TEXT' && predicate(node))
    .map((node) => ({ node, score: semanticSurfaceScore(node, root, anchor) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.node || null;
}

function semanticSurfaceScore(node, root, anchor) {
  const nodeBounds = semanticBoundsOf(node);
  const anchorBounds = semanticBoundsOf(anchor);
  const nodeArea = nodeBounds ? nodeBounds.width * nodeBounds.height : 0;
  const anchorArea = anchorBounds ? anchorBounds.width * anchorBounds.height : 0;
  let score = 0;

  if (anchorBounds && nodeBounds) {
    if (!nodeArea || !anchorArea || nodeArea < anchorArea * 0.65) return 0;
    const ratio = nodeArea / anchorArea;
    if (ratio > 140) return 0;
    if (semanticContainsBounds(nodeBounds, anchorBounds)) score += 12000;
    else if (semanticIntersectsBounds(nodeBounds, anchorBounds)) score += 5000;
    else return 0;
    score += Math.max(0, 5000 - Math.abs(ratio - 4) * 180);
  } else {
    score += node === root || node.parent === root ? 2500 : 500;
  }

  if (node === root) score += 1800;
  if (node.parent === root) score += 2200;
  if (['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 'RECTANGLE'].includes(node.type)) score += 1300;
  if (hasSolidFill(node)) score += 1200;
  if (/bg|background|fill|surface|底|背景|色块|按钮|button|btn/i.test(node.name || '')) score += 900;
  if (nodeArea) score += Math.min(nodeArea / 150, 2500);

  return score;
}

function nearestMeaningfulContainer(node) {
  let current = node.parent;
  let best = null;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    best = current;
    if (hasSolidFill(current) || ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(current.type)) return current;
    current = current.parent;
  }

  return best;
}

function nearestPredicateAncestor(node, predicate) {
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

function semanticMatches(node, query) {
  if (!query) return true;

  const haystack = [
    node.name,
    'characters' in node ? node.characters : '',
  ].map(normalizeSemanticQuery).join(' ');
  const compactHaystack = compactSemanticText(haystack);
  const compactQuery = compactSemanticText(query);

  if (haystack.includes(query)) return true;
  if (compactQuery && compactHaystack.includes(compactQuery)) return true;

  const parts = query.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => haystack.includes(part) || compactHaystack.includes(compactSemanticText(part)));
}

function semanticTargetKind(args, rawTarget, action) {
  if (args.targetKind) return args.targetKind;
  if (action === 'text') return 'text-replacement';
  if (action === 'background' && SEMANTIC_CONTROL_INTENT_RE.test(rawTarget)) return 'control';
  return action;
}

function normalizeSemanticQuery(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”‘’'"]/g, '')
    .replace(/\b(all|every|the|selected|current|layer|layers|button|buttons|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b/g, ' ')
    .replace(SEMANTIC_TARGET_QUALIFIER_RE, ' ')
    .replace(/[的]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDirectSelectionTarget(value) {
  const raw = String(value || '');
  if (!/选中|所选|当前选区|selected|selection|current/i.test(raw)) return false;

  const rest = raw
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/当前选区|选中的|选中|所选|当前|selected|selection|current/g, ' ')
    .replace(/的|里面|内部|中|里/g, ' ')
    .replace(/\b(layer|layers|frame|frames|module|modules|element|elements|content|contents|object|objects|node|nodes)\b/g, ' ')
    .replace(/图层|画板|框架|模块|元素|内容|对象|节点|组件|容器|背景色|底色|填充色|填充|背景/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return rest === '';
}

function compactSemanticText(value) {
  return String(value || '').replace(/[\s\-_/\\|:：,，.。#()[\]{}<>《》「」【】]+/g, '');
}

function hasSolidFill(node) {
  return 'fills' in node
    && Array.isArray(node.fills)
    && node.fills.some((fill) => fill.type === 'SOLID' && fill.visible !== false);
}

function semanticBoundsOf(node) {
  if (node.absoluteBoundingBox) return node.absoluteBoundingBox;
  if ('width' in node && 'height' in node) return { x: 0, y: 0, width: node.width, height: node.height };
  return null;
}

function semanticContainsBounds(outer, inner) {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height;
}

function semanticIntersectsBounds(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function addUnique(out, seen, node) {
  if (!node || seen.has(node.id)) return;
  seen.add(node.id);
  out.push(node);
}

function uniqueNodes(nodes) {
  const out = [];
  const seen = new Set();
  for (const node of nodes) addUnique(out, seen, node);
  return out;
}

function semanticResult({ nodes, query, roots, collected, matchedCount, searchMatchCount, targetKind, strategy }) {
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
