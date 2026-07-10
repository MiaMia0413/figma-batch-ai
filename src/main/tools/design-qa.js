import { increment, rgbToHex } from '../utils.js';
import { collectNodesAsync, scopedRoots, MAX_QA_NODES } from '../selection.js';

export async function designQaCheck(args = {}, context) {
  const roots = scopedRoots(args.scope);
  const collected = await collectNodesAsync(roots.nodes, MAX_QA_NODES, context);
  const nodes = collected.nodes;
  const issues = [];
  const fillCounts = new Map();
  const textSizes = new Map();
  let unnamedCount = 0;

  await context?.yieldToHost();
  for (const node of nodes) {
    await context?.yieldIfNeeded();
    if (/^(rectangle|frame|group|text|vector|instance)\s*\d*$/i.test(node.name || '')) {
      unnamedCount++;
      issues.push(issue('命名', node, '图层名称过于通用，建议改成能描述其用途的名称。'));
    }

    if (node.type === 'TEXT') {
      const fontSize = node.fontSize === figma.mixed ? 'mixed' : String(node.fontSize);
      increment(textSizes, fontSize);
      if (!node.characters.trim()) {
        issues.push(issue('文本', node, '文本图层为空。'));
      }
    }

    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID') increment(fillCounts, rgbToHex(fill.color));
      }
    }
  }

  if (fillCounts.size > 12) {
    issues.push({
      category: '颜色',
      nodeId: null,
      nodeName: roots.scope === 'page' ? '页面' : '选区',
      message: `${roots.scope === 'page' ? '页面' : '选区'}使用了 ${fillCounts.size} 个纯色填充，建议检查是否可以收敛颜色变量。`,
    });
  }

  if (textSizes.size > 8) {
    issues.push({
      category: '字体',
      nodeId: null,
      nodeName: roots.scope === 'page' ? '页面' : '选区',
      message: `${roots.scope === 'page' ? '页面' : '选区'}使用了 ${textSizes.size} 种字号，建议检查排版层级是否有意区分。`,
    });
  }

  return {
    scannedNodes: nodes.length,
    scope: roots.scope,
    unnamedCount,
    colorCount: fillCounts.size,
    textSizeCount: textSizes.size,
    truncated: roots.truncated || collected.truncated,
    sourceLimit: roots.limit,
    scanLimit: collected.limit,
    issues: issues.slice(0, 80),
  };
}

function issue(category, node, message) {
  return {
    category,
    nodeId: node.id,
    nodeName: node.name,
    message,
  };
}
