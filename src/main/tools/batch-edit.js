import { errorMessage, finiteNumber, normalizeHex, parseHexColor } from '../utils.js';
import { MAX_TEXT_SCAN_NODES, resolveTargets, summarizeNode } from '../selection.js';
import { resolveSemanticTargets } from '../semantic-targets.js';

const MAX_PAGE_MATCHES = 80;
const MAX_PAGE_CHANGES = 120;
const MAX_SELECTION_CHANGES = 300;
const DEEP_SCAN_NODES = 30000;

export async function batchSetText(args) {
  const text = String(args.text ?? '');
  const { targets } = planBatchEdit('batch_set_text', args);
  const nodes = targets.nodes;
  const replaceOnly = Boolean(args.replaceOnly);
  const targetText = String(args.target || args.targetQuery || '');
  let changed = 0;
  const skipped = [];

  for (const node of nodes) {
    try {
      await loadFontsForTextNode(node, args.fallbackFont);
      node.characters = replaceOnly && targetText
        ? replaceText(node.characters, targetText, text)
        : text;
      changed++;
    } catch (error) {
      skipped.push({ id: node.id, name: node.name, reason: errorMessage(error) });
    }
  }

  return withTargetMeta(targets, { changed, skipped, message: messageFor('已更新文本', changed, targets) });
}

function replaceText(value, from, to) {
  return String(value).split(String(from)).join(String(to));
}

export function batchSetFill(args) {
  if (isTransparentHex(args.color)) return batchRemoveFill(args);

  const color = parseHexColor(args.color);
  const paint = { type: 'SOLID', color };
  const { targets } = planBatchEdit('batch_set_fill', args);
  const nodes = targets.nodes;
  let changed = 0;

  for (const node of nodes) {
    node.fills = [paint];
    changed++;
  }

  return withTargetMeta(targets, {
    changed,
    color: normalizeHex(args.color),
    message: messageFor('已更新填充色', changed, targets),
  });
}

export function batchRemoveFill(args) {
  const { targets } = planBatchEdit('batch_remove_fill', args);
  const nodes = targets.nodes;
  let changed = 0;

  for (const node of nodes) {
    node.fills = [];
    changed++;
  }

  return withTargetMeta(targets, {
    changed,
    message: messageFor('已移除填充色', changed, targets),
  });
}

export function batchSetCornerRadius(args) {
  const radius = finiteNumber(args.radius, 'radius', 0, 200);
  const { targets } = planBatchEdit('batch_set_corner_radius', args);
  const nodes = targets.nodes;
  let changed = 0;

  for (const node of nodes) {
    node.cornerRadius = radius;
    changed++;
  }

  return withTargetMeta(targets, { changed, radius, message: messageFor('已更新圆角', changed, targets) });
}

export function batchSetOpacity(args) {
  const opacity = finiteNumber(args.opacity, 'opacity', 0, 1);
  const { targets } = planBatchEdit('batch_set_opacity', args);
  const nodes = targets.nodes;
  let changed = 0;

  for (const node of nodes) {
    node.opacity = opacity;
    changed++;
  }

  return withTargetMeta(targets, { changed, opacity, message: messageFor('已更新透明度', changed, targets) });
}

export function batchSetVisible(args) {
  const visible = Boolean(args.visible);
  const { targets } = planBatchEdit('batch_set_visible', args);
  const nodes = targets.nodes;
  let changed = 0;

  for (const node of nodes) {
    if (!('visible' in node)) continue;
    node.visible = visible;
    changed++;
  }

  return withTargetMeta(targets, { changed, visible, message: messageFor(visible ? '已显示' : '已隐藏', changed, targets) });
}

export function batchResize(args) {
  const width = args.width == null ? null : finiteNumber(args.width, 'width', 1, 10000);
  const height = args.height == null ? null : finiteNumber(args.height, 'height', 1, 10000);
  if (width == null && height == null) throw new Error('宽度和高度至少需要填写一项。');

  const { targets } = planBatchEdit('batch_resize', args);
  const nodes = targets.nodes;
  let changed = 0;

  for (const node of nodes) {
    const nextWidth = width ?? node.width;
    const nextHeight = height ?? node.height;
    node.resize(nextWidth, nextHeight);
    changed++;
  }

  return withTargetMeta(targets, { changed, width, height, message: messageFor('已调整尺寸', changed, targets) });
}

export function batchRenameLayers(args) {
  const mode = String(args.mode || 'prefix');
  const text = String(args.text || '').trim();
  const names = Array.isArray(args.names) ? args.names.map((value) => String(value || '').trim()) : [];
  const { targets } = planBatchEdit('batch_rename_layers', args);
  const nodes = targets.nodes;
  let changed = 0;

  if (mode === 'list') {
    for (let index = 0; index < nodes.length; index++) {
      if (!names[index]) continue;
      nodes[index].name = names[index].slice(0, 80);
      changed++;
    }
    return withTargetMeta(targets, { changed, mode, message: messageFor('已重命名', changed, targets) });
  }

  if (!text) throw new Error('前缀、后缀或替换模式需要填写文本。');

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (mode === 'replace') node.name = text;
    else if (mode === 'suffix') node.name = `${node.name} ${text}`.slice(0, 80);
    else node.name = `${text} ${index + 1}`.slice(0, 80);
    changed++;
  }

  return withTargetMeta(targets, { changed, mode, message: messageFor('已重命名', changed, targets) });
}

export async function previewBatchEdit(args) {
  const toolName = String(args.toolName || '');
  const toolArgs = args.toolArgs && typeof args.toolArgs === 'object' ? args.toolArgs : {};
  const { targets, action } = planBatchEdit(toolName, toolArgs);
  const fontIssues = toolName === 'batch_set_text' ? await findFontIssues(targets.nodes) : [];

  selectTargetNodes(targets.nodes);

  return withTargetMeta(targets, {
    preview: true,
    toolName,
    action,
    fontIssues,
    nodeIds: targets.nodes.map((node) => node.id),
    nodes: targets.nodes.slice(0, 40).map(summarizeNode),
    message: `正在预览 ${targets.nodes.length} 个图层，操作：${action}。`,
  });
}

function planBatchEdit(toolName, args) {
  let targets;
  let action;
  const options = batchSearchOptions(args);

  if (toolName === 'batch_set_text') {
    action = '更新文本';
    targets = resolveSemanticTargets(args, 'text', (node) => node.type === 'TEXT', {
      limit: options.limit || MAX_TEXT_SCAN_NODES,
    });
    if (args.replaceOnly) targets.targetKind = 'text-replacement';
  } else if (toolName === 'batch_set_fill') {
    action = '更新填充色';
    if (isTransparentHex(args.color)) return planBatchEdit('batch_remove_fill', args);
    parseHexColor(args.color);
    const fillArgs = normalizeFillTargetArgs(args);
    const includeText = Boolean(fillArgs.includeText);
    targets = includeText
      ? resolveSemanticTargets(fillArgs, fillArgs.containerTarget ? 'text-descendant' : 'layer', (node) => canSetFill(node), options)
      : resolveSemanticTargets(fillArgs, 'background', (node) => canSetFill(node) && node.type !== 'TEXT', options);
  } else if (toolName === 'batch_remove_fill') {
    action = '移除填充色';
    targets = resolveSemanticTargets(args, 'background', (node) => canSetFill(node) && node.type !== 'TEXT', options);
  } else if (toolName === 'batch_set_corner_radius') {
    action = '更新圆角';
    finiteNumber(args.radius, 'radius', 0, 200);
    targets = resolveSemanticTargets(args, 'background', (node) => 'cornerRadius' in node, options);
  } else if (toolName === 'batch_set_opacity') {
    action = '更新透明度';
    finiteNumber(args.opacity, 'opacity', 0, 1);
    targets = resolveTargets(args, (node) => 'opacity' in node, options);
  } else if (toolName === 'batch_set_visible') {
    action = args.visible === false ? '隐藏图层' : '显示图层';
    targets = resolveSemanticTargets(args, 'container', (node) => 'visible' in node, options);
  } else if (toolName === 'batch_resize') {
    action = '调整尺寸';
    const width = args.width == null ? null : finiteNumber(args.width, 'width', 1, 10000);
    const height = args.height == null ? null : finiteNumber(args.height, 'height', 1, 10000);
    if (width == null && height == null) throw new Error('宽度和高度至少需要填写一项。');
    targets = resolveTargets(args, (node) => 'resize' in node, options);
  } else if (toolName === 'batch_rename_layers') {
    action = '重命名图层';
    targets = resolveTargets(args, () => true, options);
  } else {
    throw new Error(`不支持预览该工具：${toolName}`);
  }

  assertSafeEdit(targets, action);
  return { targets, action };
}

function batchSearchOptions(args) {
  return args.deepSearch ? { limit: DEEP_SCAN_NODES } : {};
}

async function findFontIssues(nodes) {
  const issues = [];

  for (const node of nodes) {
    try {
      await loadFontsForTextNode(node);
    } catch (error) {
      issues.push({ id: node.id, name: node.name, reason: errorMessage(error) });
    }
  }

  return issues;
}

async function loadFontsForTextNode(node, fallbackFont) {
  try {
    await loadExistingFontsForTextNode(node);
  } catch (error) {
    if (!fallbackFont) throw error;
    await applyFallbackFont(node, fallbackFont);
  }
}

async function loadExistingFontsForTextNode(node) {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
    return;
  }

  const fonts = new Map();
  for (let index = 0; index < node.characters.length; index++) {
    const font = node.getRangeFontName(index, index + 1);
    if (font !== figma.mixed) fonts.set(`${font.family}::${font.style}`, font);
  }
  await Promise.all([...fonts.values()].map((font) => figma.loadFontAsync(font)));
}

async function applyFallbackFont(node, fallbackFont) {
  const font = {
    family: String(fallbackFont.family || ''),
    style: String(fallbackFont.style || ''),
  };
  if (!font.family || !font.style) throw new Error('备用字体需要包含字体族和字重样式。');

  await figma.loadFontAsync(font);
  node.fontName = font;
}

function canSetFill(node) {
  return 'fills' in node && node.fills !== figma.mixed;
}

function normalizeFillTargetArgs(args) {
  const relation = splitContainerTextTarget(args.target || args.targetQuery || '');
  if (!relation) return args;
  return {
    ...args,
    target: relation.child,
    containerTarget: args.containerTarget || relation.container,
    includeText: true,
  };
}

function splitContainerTextTarget(value) {
  const match = String(value || '').trim().match(/^(.+?)(?:的|\s+)?(标题|副标题|主标题|文案|文字|文本|title|subtitle)$/i);
  if (!match) return null;

  const container = String(match[1] || '').trim();
  const child = String(match[2] || '').trim();
  if (!container || !child) return null;
  return { container, child };
}

function isTransparentHex(value) {
  return /^#?([0-9a-f]{6}00|[0-9a-f]{8})$/i.test(String(value || '').trim())
    && String(value || '').trim().slice(-2).toLowerCase() === '00';
}

function selectTargetNodes(nodes) {
  figma.currentPage.selection = nodes;
  if (nodes.length) figma.viewport.scrollAndZoomIntoView(nodes);
}

function assertSafeEdit(targets, action) {
  if (!targets.nodes.length) {
    throw new Error(`没有找到可编辑图层${targetLabel(targets)}。请使用更具体的目标名称，或先选中需要修改的区域。`);
  }

  if (targets.scope === 'page' && !targets.query) {
    throw new Error(`页面级${action}需要使用用户请求中的目标描述。`);
  }

  if (
    targets.scope === 'page'
    && !['control', 'text-replacement'].includes(targets.targetKind)
    && targets.matchedCount > MAX_PAGE_MATCHES
  ) {
    throw new Error([
      `已拒绝${action}：目标“${targets.query}”在页面中命中了 ${targets.matchedCount} 个图层。`,
      '这个范围看起来过大。请使用请求中的精确目标，或先选中更小的区域。',
    ].join(' '));
  }

  if (targets.scope === 'page' && targets.nodes.length > MAX_PAGE_CHANGES) {
    throw new Error([
      `已拒绝${action}：这会修改页面中的 ${targets.nodes.length} 个图层。`,
      `页面级安全上限是 ${MAX_PAGE_CHANGES} 个图层。请使用更具体的目标，或先选中更小的区域。`,
    ].join(' '));
  }

  if (targets.scope === 'selection' && targets.nodes.length > MAX_SELECTION_CHANGES) {
    throw new Error([
      `已拒绝${action}：这会修改选区中的 ${targets.nodes.length} 个图层。`,
      `选区安全上限是 ${MAX_SELECTION_CHANGES} 个图层。请选中更小的区域，或使用更具体的目标。`,
    ].join(' '));
  }
}

function withTargetMeta(targets, result) {
  return {
    ...result,
    scope: targets.scope,
    sourceCount: targets.sourceCount,
    matchedCount: targets.matchedCount,
    searchMatchCount: targets.searchMatchCount,
    targetKind: targets.targetKind,
    targetCount: targets.nodes.length,
    targetQuery: targets.query,
    truncated: targets.truncated,
    limit: targets.limit,
  };
}

function messageFor(action, changed, targets) {
  const where = targets.query
    ? `，匹配目标“${targets.query}”`
    : '';
  return `${action}：在${scopeLabel(targets.scope)}中修改了 ${changed} 个图层${where}。`;
}

function targetLabel(targets) {
  return targets.query ? `，匹配目标“${targets.query}”` : '';
}

function scopeLabel(scope) {
  if (scope === 'page') return '页面';
  if (scope === 'selection') return '选区';
  if (scope === 'preview') return '预览范围';
  return scope || '当前范围';
}
