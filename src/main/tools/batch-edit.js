import { SafetyError, ValidationError, isCancelledError } from '../../shared/errors.js';
import { errorMessage, finiteNumber, normalizeHex, parseHexColor } from '../utils.js';
import { MAX_TEXT_SCAN_NODES, resolveTargets, summarizeNode } from '../selection.js';
import { resolveSemanticTargets } from '../semantic-targets.js';
import { runNodeBatch } from './batch-operation.js';

const MAX_PAGE_MATCHES = 80;
const MAX_PAGE_CHANGES = 120;
const MAX_SELECTION_CHANGES = 300;
const DEEP_SCAN_NODES = 30000;

export async function batchSetText(args, context) {
  const text = String(args.text ?? '');
  const { targets } = await planBatchEdit('batch_set_text', args, context);
  const nodes = targets.nodes;
  const replaceOnly = Boolean(args.replaceOnly);
  const targetText = String(args.target || args.targetQuery || '');
  const { changed, skipped } = await runNodeBatch(nodes, context, async (node) => {
    await loadFontsForTextNode(node, args.fallbackFont);
    context?.checkCancelled();
    node.characters = replaceOnly && targetText ? replaceText(node.characters, targetText, text) : text;
  });

  return withTargetMeta(targets, { changed, skipped, message: messageFor('已更新文本', changed, targets) });
}

function replaceText(value, from, to) {
  return String(value).split(String(from)).join(String(to));
}

export async function batchSetFill(args, context) {
  if (isTransparentHex(args.color)) return batchRemoveFill(args, context);

  const color = parseHexColor(args.color);
  const paint = { type: 'SOLID', color };
  const { targets } = await planBatchEdit('batch_set_fill', args, context);
  const nodes = targets.nodes;
  const { changed, skipped } = await runNodeBatch(nodes, context, (node) => {
    node.fills = [paint];
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    color: normalizeHex(args.color),
    message: messageFor('已更新填充色', changed, targets),
  });
}

export async function batchRemoveFill(args, context) {
  const { targets } = await planBatchEdit('batch_remove_fill', args, context);
  const nodes = targets.nodes;
  const { changed, skipped } = await runNodeBatch(nodes, context, (node) => {
    node.fills = [];
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    message: messageFor('已移除填充色', changed, targets),
  });
}

export async function batchSetCornerRadius(args, context) {
  const radius = finiteNumber(args.radius, 'radius', 0, 200);
  const { targets } = await planBatchEdit('batch_set_corner_radius', args, context);
  const nodes = targets.nodes;
  const { changed, skipped } = await runNodeBatch(nodes, context, (node) => {
    node.cornerRadius = radius;
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    radius,
    message: messageFor('已更新圆角', changed, targets),
  });
}

export async function batchSetOpacity(args, context) {
  const opacity = finiteNumber(args.opacity, 'opacity', 0, 1);
  const { targets } = await planBatchEdit('batch_set_opacity', args, context);
  const nodes = targets.nodes;
  const { changed, skipped } = await runNodeBatch(nodes, context, (node) => {
    node.opacity = opacity;
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    opacity,
    message: messageFor('已更新透明度', changed, targets),
  });
}

export async function batchSetVisible(args, context) {
  const visible = Boolean(args.visible);
  const { targets } = await planBatchEdit('batch_set_visible', args, context);
  const nodes = targets.nodes;
  const { changed, skipped } = await runNodeBatch(nodes, context, (node) => {
    if (!('visible' in node)) return false;
    node.visible = visible;
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    visible,
    message: messageFor(visible ? '已显示' : '已隐藏', changed, targets),
  });
}

export async function batchResize(args, context) {
  const width = args.width == null ? null : finiteNumber(args.width, 'width', 1, 10000);
  const height = args.height == null ? null : finiteNumber(args.height, 'height', 1, 10000);
  if (width == null && height == null) throw new ValidationError('宽度和高度至少需要填写一项。');

  const { targets } = await planBatchEdit('batch_resize', args, context);
  const nodes = targets.nodes;
  const { changed, skipped } = await runNodeBatch(nodes, context, (node) => {
    const nextWidth = width ?? node.width;
    const nextHeight = height ?? node.height;
    node.resize(nextWidth, nextHeight);
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    width,
    height,
    message: messageFor('已调整尺寸', changed, targets),
  });
}

export async function batchRenameLayers(args, context) {
  const mode = String(args.mode || 'prefix');
  const text = String(args.text || '').trim();
  const names = Array.isArray(args.names) ? args.names.map((value) => String(value || '').trim()) : [];
  const { targets } = await planBatchEdit('batch_rename_layers', args, context);
  const nodes = targets.nodes;
  if (mode === 'list') {
    const { changed, skipped } = await runNodeBatch(nodes, context, (node, index) => {
      if (!names[index]) return false;
      node.name = names[index].slice(0, 80);
    });
    return withTargetMeta(targets, {
      changed,
      skipped,
      mode,
      message: messageFor('已重命名', changed, targets),
    });
  }

  if (!text) throw new ValidationError('前缀、后缀或替换模式需要填写文本。');

  const { changed, skipped } = await runNodeBatch(nodes, context, (node, index) => {
    if (mode === 'replace') node.name = text;
    else if (mode === 'suffix') node.name = `${node.name} ${text}`.slice(0, 80);
    else node.name = `${text} ${index + 1}`.slice(0, 80);
  });

  return withTargetMeta(targets, {
    changed,
    skipped,
    mode,
    message: messageFor('已重命名', changed, targets),
  });
}

export async function previewBatchEdit(toolName, toolArgs = {}, context) {
  const { targets, action } = await planBatchEdit(toolName, toolArgs, context);
  const fontIssues = toolName === 'batch_set_text' ? await findFontIssues(targets.nodes, context) : [];

  await context?.yieldToHost();
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

async function planBatchEdit(toolName, args, context) {
  let targets;
  let action;
  const options = batchSearchOptions(args, context);

  if (toolName === 'batch_set_text') {
    action = '更新文本';
    targets = await resolveSemanticTargets(args, 'text', (node) => node.type === 'TEXT', {
      ...options,
      limit: options.limit || MAX_TEXT_SCAN_NODES,
    });
    if (args.replaceOnly) targets.targetKind = 'text-replacement';
  } else if (toolName === 'batch_set_fill') {
    action = '更新填充色';
    if (isTransparentHex(args.color)) return planBatchEdit('batch_remove_fill', args, context);
    parseHexColor(args.color);
    const fillArgs = normalizeFillTargetArgs(args);
    const includeText = Boolean(fillArgs.includeText);
    targets = includeText
      ? await resolveSemanticTargets(
          fillArgs,
          fillArgs.containerTarget ? 'text-descendant' : 'layer',
          (node) => canSetFill(node),
          options,
        )
      : await resolveSemanticTargets(
          fillArgs,
          'background',
          (node) => canSetFill(node) && node.type !== 'TEXT',
          options,
        );
  } else if (toolName === 'batch_remove_fill') {
    action = '移除填充色';
    targets = await resolveSemanticTargets(
      args,
      'background',
      (node) => canSetFill(node) && node.type !== 'TEXT',
      options,
    );
  } else if (toolName === 'batch_set_corner_radius') {
    action = '更新圆角';
    finiteNumber(args.radius, 'radius', 0, 200);
    targets = await resolveSemanticTargets(args, 'background', (node) => 'cornerRadius' in node, options);
  } else if (toolName === 'batch_set_opacity') {
    action = '更新透明度';
    finiteNumber(args.opacity, 'opacity', 0, 1);
    targets = await resolveTargets(args, (node) => 'opacity' in node, options);
  } else if (toolName === 'batch_set_visible') {
    action = args.visible === false ? '隐藏图层' : '显示图层';
    targets = await resolveSemanticTargets(args, 'container', (node) => 'visible' in node, options);
  } else if (toolName === 'batch_resize') {
    action = '调整尺寸';
    const width = args.width == null ? null : finiteNumber(args.width, 'width', 1, 10000);
    const height = args.height == null ? null : finiteNumber(args.height, 'height', 1, 10000);
    if (width == null && height == null) throw new ValidationError('宽度和高度至少需要填写一项。');
    targets = await resolveTargets(args, (node) => 'resize' in node, options);
  } else if (toolName === 'batch_rename_layers') {
    action = '重命名图层';
    targets = await resolveTargets(args, () => true, options);
  } else {
    throw new Error(`不支持预览该工具：${toolName}`);
  }

  assertSafeEdit(targets, action);
  return { targets, action };
}

function batchSearchOptions(args, context) {
  return {
    ...(args.deepSearch ? { limit: DEEP_SCAN_NODES } : {}),
    checkCancelled: context?.checkCancelled,
    yieldIfNeeded: context?.yieldIfNeeded,
  };
}

async function findFontIssues(nodes, context) {
  const issues = [];

  for (const node of nodes) {
    await context?.yieldIfNeeded();
    try {
      await loadFontsForTextNode(node);
      context?.checkCancelled();
    } catch (error) {
      if (isCancelledError(error)) throw error;
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
  if (!font.family || !font.style) throw new ValidationError('备用字体需要包含字体族和字重样式。');

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
  const match = String(value || '')
    .trim()
    .match(/^(.+?)(?:的|\s+)?(标题|副标题|主标题|文案|文字|文本|title|subtitle)$/i);
  if (!match) return null;

  const container = String(match[1] || '').trim();
  const child = String(match[2] || '').trim();
  if (!container || !child) return null;
  return { container, child };
}

function isTransparentHex(value) {
  return (
    /^#?([0-9a-f]{6}00|[0-9a-f]{8})$/i.test(String(value || '').trim()) &&
    String(value || '')
      .trim()
      .slice(-2)
      .toLowerCase() === '00'
  );
}

function selectTargetNodes(nodes) {
  figma.currentPage.selection = nodes;
  if (nodes.length) figma.viewport.scrollAndZoomIntoView(nodes);
}

function assertSafeEdit(targets, action) {
  if (!targets.nodes.length) {
    throw new SafetyError(
      `没有找到可编辑图层${targetLabel(targets)}。请使用更具体的目标名称，或先选中需要修改的区域。`,
    );
  }

  if (targets.scope === 'page' && !targets.query) {
    throw new SafetyError(`页面级${action}需要使用用户请求中的目标描述。`);
  }

  if (
    targets.scope === 'page' &&
    !['control', 'text-replacement'].includes(targets.targetKind) &&
    targets.matchedCount > MAX_PAGE_MATCHES
  ) {
    throw new SafetyError(
      [
        `已拒绝${action}：目标“${targets.query}”在页面中命中了 ${targets.matchedCount} 个图层。`,
        '这个范围看起来过大。请使用请求中的精确目标，或先选中更小的区域。',
      ].join(' '),
    );
  }

  if (targets.scope === 'page' && targets.nodes.length > MAX_PAGE_CHANGES) {
    throw new SafetyError(
      [
        `已拒绝${action}：这会修改页面中的 ${targets.nodes.length} 个图层。`,
        `页面级安全上限是 ${MAX_PAGE_CHANGES} 个图层。请使用更具体的目标，或先选中更小的区域。`,
      ].join(' '),
    );
  }

  if (targets.scope === 'selection' && targets.nodes.length > MAX_SELECTION_CHANGES) {
    throw new SafetyError(
      [
        `已拒绝${action}：这会修改选区中的 ${targets.nodes.length} 个图层。`,
        `选区安全上限是 ${MAX_SELECTION_CHANGES} 个图层。请选中更小的区域，或使用更具体的目标。`,
      ].join(' '),
    );
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
  const where = targets.query ? `，匹配目标“${targets.query}”` : '';
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
