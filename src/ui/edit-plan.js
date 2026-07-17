import { splitContainerTextTarget } from '../shared/container-text-phrase.js';
import { hasControlTargetIntent, normalizeTargetQuery } from '../shared/target-utils.js';

export function createEditPlan(prompt) {
  const intent = analyzeIntent(prompt);
  return planFromIntent(intent);
}

export function enrichArgsFromPrompt(toolName, args, prompt) {
  const plan = createEditPlan(prompt);
  if (plan && plan.toolName === toolName) {
    Object.assign(args, { ...plan.args, ...args });
  }

  const intent = analyzeIntent(prompt);
  if (['batch_set_fill', 'batch_remove_fill'].includes(toolName) && intent.targetKind === 'control') {
    args.targetKind = 'control';
  }
}

export function normalizeTarget(value) {
  return normalizeTargetQuery(value, { stripHexColors: true });
}

function analyzeIntent(prompt) {
  const text = String(prompt || '').trim();
  const intent = {
    raw: text,
    kind: 'unknown',
    target: '',
    scope: scopeFromText(text),
    targetKind: hasControlIntent(text) ? 'control' : 'layer',
    count: countFromText(text),
    placement: placementFromText(text),
    layout: layoutFromText(text),
    value: null,
    from: '',
    to: '',
  };

  return (
    analyzeDuplicate(intent) ||
    analyzeRemoveFill(intent) ||
    analyzeSetFill(intent) ||
    analyzeCornerRadius(intent) ||
    analyzeOpacity(intent) ||
    analyzeResize(intent) ||
    analyzeVisibility(intent) ||
    analyzeSetText(intent) ||
    analyzeTextReplacement(intent) ||
    analyzeRename(intent) ||
    intent
  );
}

function planFromIntent(intent) {
  if (!intent || intent.kind === 'unknown') return null;

  const target = intent.target || intent.from;
  if (!target) return null;

  const common = {
    target,
    scope: intent.scope,
  };

  if (intent.kind === 'duplicate') {
    return plan(intent, 'duplicate_layers', {
      ...common,
      count: intent.count,
      placement: intent.placement,
      layout: intent.layout,
    });
  }

  if (intent.kind === 'set_fill') {
    return plan(intent, 'batch_set_fill', {
      ...common,
      color: intent.value,
      targetKind: intent.targetKind,
      includeText: intent.includeText,
      containerTarget: intent.containerTarget,
    });
  }

  if (intent.kind === 'remove_fill') {
    return plan(intent, 'batch_remove_fill', {
      ...common,
      targetKind: intent.targetKind,
    });
  }

  if (intent.kind === 'replace_text') {
    return plan(intent, 'batch_set_text', {
      target: intent.from,
      text: intent.to,
      replaceOnly: true,
      scope: intent.scope,
    });
  }

  if (intent.kind === 'set_text') {
    return plan(intent, 'batch_set_text', {
      ...common,
      text: intent.value,
      replaceOnly: false,
      ...(intent.containerTarget ? { containerTarget: intent.containerTarget } : {}),
    });
  }

  if (intent.kind === 'rename') {
    return plan(intent, 'batch_rename_layers', {
      ...common,
      mode: intent.mode,
      text: intent.value,
    });
  }

  if (intent.kind === 'set_corner_radius') {
    return plan(intent, 'batch_set_corner_radius', {
      ...common,
      radius: intent.value,
    });
  }

  if (intent.kind === 'set_opacity') {
    return plan(intent, 'batch_set_opacity', {
      ...common,
      opacity: intent.value,
    });
  }

  if (intent.kind === 'resize') {
    return plan(intent, 'batch_resize', {
      ...common,
      ...(intent.width == null ? {} : { width: intent.width }),
      ...(intent.height == null ? {} : { height: intent.height }),
    });
  }

  if (intent.kind === 'set_visible') {
    return plan(intent, 'batch_set_visible', {
      ...common,
      visible: intent.value,
    });
  }

  return null;
}

function plan(intent, toolName, args) {
  return {
    action: intent.kind,
    intent,
    toolName,
    args,
  };
}

function analyzeDuplicate(base) {
  const text = base.raw;
  const patterns = [
    /^(?:复制|拷贝|克隆)\s*(?:(?:\d+|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个|份|张)?|一份|一个|一下)?\s*(.+?)\s*$/i,
    /^(?:将|把)\s*(.+?)\s*(?:复制|拷贝|克隆)\s*(?:(?:\d+|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个|份|张)?|一份|一个|一下)?(?:.*)?$/i,
    /^(?:duplicate|copy|clone)\s+(.+?)\s*$/i,
  ];
  const match = firstMatch(text, patterns);
  if (!match) return null;

  const target = cleanDuplicateTarget(match[1]);
  if (!target) return null;

  return {
    ...base,
    kind: 'duplicate',
    target,
    scope: scopeFromText(`${text} ${target}`),
  };
}

function analyzeSetFill(base) {
  if (hasStrokeIntent(base.raw)) return null;

  const patterns = [
    /^(?:将|把)\s*(.+?)\s*(?:的)?(?:色值|颜色|文字颜色|文本颜色|字体颜色|文字色|文本色)\s*(?:改成|改为|替换成|替换为|换成|变成)\s*(#[0-9a-f]{3,8})\s*$/i,
    /^(?:将|把)\s*(.+?)\s*(?:的)?(?:背景色|底色|填充色|填充)\s*(?:改成|改为|替换成|替换为|换成|变成)\s*(#[0-9a-f]{3,8})\s*$/i,
    /^(?:set|change)\s+(.+?)\s+(?:background|fill)\s+(?:to\s+)?(#[0-9a-f]{3,8})\s*$/i,
  ];
  const match = firstMatch(base.raw, patterns);
  if (!match) return null;

  const textRelation = splitContainerTextTarget(match[1]);
  const target = cleanPart(textRelation?.child || match[1]);
  const color = cleanPart(match[2]);
  if (!target || !isColorValue(color)) return null;

  return {
    ...base,
    kind: 'set_fill',
    target,
    containerTarget: textRelation?.container || '',
    includeText: Boolean(textRelation) || hasTextColorIntent(base.raw, target),
    value: color,
    scope: scopeFromText(`${base.raw} ${target}`),
    targetKind: hasControlIntent(target) ? 'control' : base.targetKind,
  };
}

function analyzeRemoveFill(base) {
  const patterns = [
    /^(?:将|把)\s*(.+?)\s*(?:的)?(?:背景色|底色|填充色|填充)\s*(?:去掉|去除|移除|删除|清除|清空|取消|设为无|改为无|改成无)\s*$/i,
    /^(?:去掉|去除|移除|删除|清除|清空|取消)\s*(.+?)\s*(?:的)?(?:背景色|底色|填充色|填充)\s*$/i,
    /^(?:remove|clear|delete|unset)\s+(.+?)\s+(?:background|fill)(?:\s+color)?\s*$/i,
  ];
  const match = firstMatch(base.raw, patterns);
  if (!match) return null;

  const target = cleanPart(match[1]);
  if (!target) return null;

  return {
    ...base,
    kind: 'remove_fill',
    target,
    scope: scopeFromText(`${base.raw} ${target}`),
    targetKind: hasControlIntent(target) ? 'control' : base.targetKind,
  };
}

function analyzeSetText(base) {
  const patterns = [
    /^(?:将|把)\s*(.+?)(?:的)?(?:文案|文字|文本|标题|副标题|主标题|标签文字)\s*(?:改成|改为|替换成|替换为|换成|设为|设置为|变成)\s*(.+?)\s*$/i,
    /^(?:set|change)\s+(.+?)\s+(?:copy|text|label|title|subtitle)\s+(?:to\s+)?(.+?)\s*$/i,
  ];
  const match = firstMatch(base.raw, patterns);
  if (!match) return null;

  const fullChineseTarget = base.raw.match(
    /^(?:将|把)\s*(.+?)\s*(?:改成|改为|替换成|替换为|换成|设为|设置为|变成)/i,
  )?.[1];
  const inferredRelation = splitContainerTextTarget(fullChineseTarget);
  const relation =
    (inferredRelation && !hasControlIntent(inferredRelation.container) ? inferredRelation : null) ||
    splitContainerTextTarget(match[1]);
  const target = cleanPart(relation?.child || match[1]);
  const text = cleanPart(match[2]);
  if (!target || !text || isColorValue(text)) return null;

  return {
    ...base,
    kind: 'set_text',
    target,
    containerTarget: relation?.container || '',
    value: text,
    scope: scopeFromText(`${base.raw} ${target}`),
  };
}

function analyzeRename(base) {
  const affixPatterns = [
    {
      pattern:
        /^(?:给|为|将|把)\s*(.+?)(?:的)?(?:图层)?(?:名称|名字|命名)?\s*(?:添加|加上|加)\s*(?:名称)?前缀\s*[“"']?(.+?)[”"']?\s*$/i,
      mode: 'prefix',
    },
    {
      pattern:
        /^(?:给|为|将|把)\s*(.+?)(?:的)?(?:图层)?(?:名称|名字|命名)?\s*(?:添加|加上|加)\s*(?:名称)?后缀\s*[“"']?(.+?)[”"']?\s*$/i,
      mode: 'suffix',
    },
    {
      pattern: /^(?:add|apply)\s+(?:the\s+)?prefix\s+["']?(.+?)["']?\s+to\s+(.+?)\s*$/i,
      mode: 'prefix',
      valueIndex: 1,
      targetIndex: 2,
    },
    {
      pattern: /^(?:add|apply)\s+(?:the\s+)?suffix\s+["']?(.+?)["']?\s+to\s+(.+?)\s*$/i,
      mode: 'suffix',
      valueIndex: 1,
      targetIndex: 2,
    },
  ];

  for (const { pattern, mode, targetIndex = 1, valueIndex = 2 } of affixPatterns) {
    const match = base.raw.match(pattern);
    if (!match) continue;
    const target = cleanLayerTarget(match[targetIndex]);
    const value = cleanPart(match[valueIndex]);
    if (!target || !value) return null;
    return {
      ...base,
      kind: 'rename',
      target,
      mode,
      value,
      scope: scopeFromText(`${base.raw} ${target}`),
    };
  }

  const replacePatterns = [
    /^(?:将|把)\s*(.+?)\s*(?:重命名为|改名为|命名为)\s*(.+?)\s*$/i,
    /^(?:将|把)\s*(.+?)(?:的)?(?:图层)?(?:名称|名字|命名)\s*(?:改成|改为|替换成|替换为|设为|设置为)\s*(.+?)\s*$/i,
    /^rename\s+(.+?)\s+(?:to|as)\s+(.+?)\s*$/i,
  ];
  const match = firstMatch(base.raw, replacePatterns);
  if (!match) return null;

  const target = cleanLayerTarget(match[1]);
  const value = cleanPart(match[2]);
  if (!target || !value) return null;

  return {
    ...base,
    kind: 'rename',
    target,
    mode: 'replace',
    value,
    scope: scopeFromText(`${base.raw} ${target}`),
  };
}

function analyzeTextReplacement(base) {
  const patterns = [
    /^(?:将|把)\s*(.+?)\s*(?:改成|改为|替换成|替换为|换成|变成)\s*(.+?)\s*$/,
    /^change\s+(.+?)\s+to\s+(.+?)\s*$/i,
    /^replace\s+(.+?)\s+with\s+(.+?)\s*$/i,
    /^rename\s+(.+?)\s+(?:to|as)\s+(.+?)\s*$/i,
  ];
  const match = firstMatch(base.raw, patterns);
  if (!match) return null;

  const from = cleanPart(match[1]);
  const to = cleanPart(match[2]);
  if (
    !from ||
    !to ||
    isColorValue(to) ||
    hasDesignPropertyIntent(from) ||
    hasDesignPropertyIntent(to) ||
    hasControlIntent(from) ||
    hasTextRoleIntent(from) ||
    hasLayerTargetIntent(from)
  ) {
    return null;
  }

  return {
    ...base,
    kind: 'replace_text',
    from,
    to,
  };
}

function analyzeCornerRadius(base) {
  const match = firstMatch(base.raw, [
    /^(?:将|把)\s*(.+?)\s*(?:的)?(?:圆角|radius|corner radius)\s*(?:改成|改为|设为|设置为|变成)\s*(\d+(?:\.\d+)?)\s*(?:px|像素)?\s*$/i,
    /^(?:set|change)\s+(.+?)\s+(?:corner radius|radius)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i,
    /^round\s+(.+?)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i,
  ]);
  if (!match) return null;

  const target = cleanPart(match[1]);
  const radius = Number(match[2]);
  if (!target || !Number.isFinite(radius)) return null;

  return {
    ...base,
    kind: 'set_corner_radius',
    target,
    value: radius,
    scope: scopeFromText(`${base.raw} ${target}`),
  };
}

function analyzeOpacity(base) {
  const patterns = [
    /^(?:将|把)\s*(.+?)\s*(?:的)?(?:透明度|不透明度)\s*(?:改成|改为|设为|设置为|变成)\s*(\d+(?:\.\d+)?)\s*(%)?\s*$/i,
    /^(?:set|change)\s+(.+?)\s+opacity\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(%)?\s*$/i,
  ];
  const match = firstMatch(base.raw, patterns);
  if (!match) return null;

  const target = cleanPart(match[1]);
  const rawValue = Number(match[2]);
  const opacity = match[3] ? rawValue / 100 : rawValue;
  if (!target || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) return null;

  return {
    ...base,
    kind: 'set_opacity',
    target,
    value: opacity,
    scope: scopeFromText(`${base.raw} ${target}`),
  };
}

function analyzeResize(base) {
  const dimensionPatterns = [
    {
      pattern:
        /^(?:将|把)\s*(.+?)\s*(?:的)?宽度\s*(?:改成|改为|设为|设置为|变成)\s*(\d+(?:\.\d+)?)\s*(?:px|像素)?\s*$/i,
      dimension: 'width',
    },
    {
      pattern:
        /^(?:将|把)\s*(.+?)\s*(?:的)?高度\s*(?:改成|改为|设为|设置为|变成)\s*(\d+(?:\.\d+)?)\s*(?:px|像素)?\s*$/i,
      dimension: 'height',
    },
    {
      pattern: /^(?:set|change)\s+(.+?)\s+width\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i,
      dimension: 'width',
    },
    {
      pattern: /^(?:set|change)\s+(.+?)\s+height\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i,
      dimension: 'height',
    },
  ];

  for (const { pattern, dimension } of dimensionPatterns) {
    const match = base.raw.match(pattern);
    if (!match) continue;
    const target = cleanPart(match[1]);
    const value = Number(match[2]);
    if (!target || !Number.isFinite(value) || value <= 0) return null;
    return {
      ...base,
      kind: 'resize',
      target,
      [dimension]: value,
      scope: scopeFromText(`${base.raw} ${target}`),
    };
  }

  const sizeMatch = firstMatch(base.raw, [
    /^(?:将|把)\s*(.+?)\s*(?:的)?(?:尺寸|大小)\s*(?:改成|改为|设为|设置为|变成)\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:px|像素)?\s*$/i,
    /^resize\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i,
  ]);
  if (!sizeMatch) return null;

  const target = cleanPart(sizeMatch[1]);
  const width = Number(sizeMatch[2]);
  const height = Number(sizeMatch[3]);
  if (!target || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    ...base,
    kind: 'resize',
    target,
    width,
    height,
    scope: scopeFromText(`${base.raw} ${target}`),
  };
}

function analyzeVisibility(base) {
  const hidePatterns = [/^(?:隐藏|hide)\s*(.+?)\s*$/i, /^(?:将|把)\s*(.+?)\s*(?:隐藏|设为隐藏)\s*$/i];
  const showPatterns = [/^(?:显示|show|unhide)\s*(.+?)\s*$/i, /^(?:将|把)\s*(.+?)\s*(?:显示|设为可见)\s*$/i];
  const hiddenMatch = firstMatch(base.raw, hidePatterns);
  const shownMatch = hiddenMatch ? null : firstMatch(base.raw, showPatterns);
  const match = hiddenMatch || shownMatch;
  if (!match) return null;

  const target = cleanPart(match[1])
    .replace(/隐藏的?|hidden/gi, '')
    .trim();
  if (!target) return null;

  return {
    ...base,
    kind: 'set_visible',
    target,
    value: Boolean(shownMatch),
    scope: scopeFromText(`${base.raw} ${target}`),
  };
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function cleanPart(value) {
  return String(value || '')
    .trim()
    .replace(/[“”‘’]/g, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function cleanDuplicateTarget(value) {
  return cleanPart(value)
    .replace(/^\s*(\d+|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个|份|张)?\s*/i, '')
    .replace(
      /\s*(?:放在|放到|放置在|置于|在|到|至|于)\s*(?:左下角|右下角|左上角|右上角|左边|左侧|左方|右边|右侧|右方|上方|上面|顶部|下方|下面|底部).*/i,
      '',
    )
    .replace(/\s*(?:排列|横向|纵向|竖向|水平|垂直).*/i, '')
    .trim();
}

function cleanLayerTarget(value) {
  return cleanPart(value)
    .replace(/(?:的)?(?:图层)?(?:名称|名字|命名)$/i, '')
    .trim();
}

function hasTextColorIntent(raw, target) {
  return (
    /文字颜色|文本颜色|字体颜色|文字色|文本色|色值|颜色/i.test(String(raw || '')) &&
    /标题|副标题|主标题|文案|文字|文本|title|subtitle/i.test(String(target || raw || ''))
  );
}

function countFromText(value) {
  const text = String(value || '');
  const match = text.match(
    /(?:复制|拷贝|克隆)\s*(\d+|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个|份|张)?|(\d+|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个|份|张)\s*(?:副本|复制|拷贝|克隆)?/i,
  );
  const raw = match?.[1] || match?.[2];
  return chineseNumber(raw) || 1;
}

function placementFromText(value) {
  const text = String(value || '');
  if (/左下|下左|bottom\s*left/i.test(text)) return 'bottom-left';
  if (/右下|下右|bottom\s*right/i.test(text)) return 'bottom-right';
  if (/左上|上左|top\s*left/i.test(text)) return 'top-left';
  if (/右上|上右|top\s*right/i.test(text)) return 'top-right';
  if (/左边|左侧|左方|\bleft\b/i.test(text)) return 'left';
  if (/右边|右侧|右方|\bright\b/i.test(text)) return 'right';
  if (/下方|下面|底部|\bbottom\b|below/i.test(text)) return 'bottom';
  if (/上方|上面|顶部|\btop\b|above/i.test(text)) return 'top';
  return 'auto';
}

function layoutFromText(value) {
  const text = String(value || '');
  if (/纵向|竖向|垂直|vertical/i.test(text)) return 'vertical';
  if (/横向|水平|horizontal/i.test(text)) return 'horizontal';
  return 'auto';
}

function scopeFromText(value) {
  return /选中|所选|当前选区|selected|selection/i.test(String(value || '')) ? 'selection' : 'page';
}

function chineseNumber(value) {
  const text = String(value || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  return (
    {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    }[text] || null
  );
}

function hasControlIntent(value) {
  return hasControlTargetIntent(value);
}

function hasStrokeIntent(value) {
  return /\b(border|stroke|outline)\b|边框|描边|轮廓/i.test(String(value || ''));
}

function hasTextRoleIntent(value) {
  return /\b(title|subtitle|copy|label|text)\b|标题|副标题|主标题|文案|文字|文本/i.test(String(value || ''));
}

function hasLayerTargetIntent(value) {
  return /\b(layer|layers|frame|frames|group|groups|component|components|instance|instances|section|sections|icon|icons)\b|图层|画板|框架|分组|组件|实例|区块|图标/i.test(
    String(value || ''),
  );
}

function hasDesignPropertyIntent(value) {
  return /\b(width|height|size|opacity|radius|color|background|fill|border|stroke|layout|spacing|padding|margin|visible|visibility|font|typeface|weight|line height|letter spacing|shadow|gradient|blur)\b|宽度|高度|尺寸|大小|透明度|不透明度|圆角|颜色|色值|背景|底色|填充|边框|描边|布局|间距|内边距|外边距|可见|隐藏|字号|字体|字重|行高|字间距|阴影|渐变|模糊/i.test(
    String(value || ''),
  );
}

function isColorValue(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '').trim());
}
