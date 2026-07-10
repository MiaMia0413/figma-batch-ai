const CONTROL_TARGET_RE =
  /\b(button|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|list item|list items|menu item|menu items|nav item|nav items|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/i;
const TARGET_QUALIFIER_RE =
  /全部|所有|当前|选中|图层|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/g;
const ENGLISH_TARGET_QUALIFIER_RE =
  /\b(all|every|the|selected|current|layer|layers|button|buttons|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b/g;

export function hasControlTargetIntent(value) {
  return CONTROL_TARGET_RE.test(String(value || ''));
}

export function normalizeTargetQuery(value, options = {}) {
  const { stripHexColors = false, stripPossessive = false } = options;
  let text = String(value || '');
  if (stripHexColors) text = text.replace(/#[0-9a-f]{3,8}\b/gi, ' ');

  text = text
    .toLowerCase()
    .replace(/[“”‘’"'`#]/g, ' ')
    .replace(ENGLISH_TARGET_QUALIFIER_RE, ' ')
    .replace(TARGET_QUALIFIER_RE, ' ');

  if (stripPossessive) text = text.replace(/[的]/g, ' ');

  return text.replace(/\s+/g, ' ').trim();
}

export function compactTargetText(value) {
  return String(value || '').replace(/[\s\-_/\\|:：,，.。#()[\]{}<>《》「」【】]+/g, '');
}

export function matchesTargetQuery(values, query, options = {}) {
  const normalizeQuery = options.normalizeQuery || normalizeTargetQuery;
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return true;

  const haystack = (Array.isArray(values) ? values : [values]).map(normalizeQuery).join(' ');
  const compactHaystack = compactTargetText(haystack);
  const compactQuery = compactTargetText(normalizedQuery);

  if (haystack.includes(normalizedQuery)) return true;
  if (compactQuery && compactHaystack.includes(compactQuery)) return true;

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part) || compactHaystack.includes(compactTargetText(part)));
}

export function normalizeDuplicateTargetQuery(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/当前选中|当前选区|选中的|选中|所选|当前|selected|selection|current/gi, ' ')
    .replace(/复制|拷贝|克隆|一份|一个|一下|副本|的/g, ' ')
    .replace(/(\d+|一|二|两|三|四|五|六|七|八|九|十)\s*(?:个|份|张)?/g, ' ')
    .replace(
      /(?:放在|放到|放置在|置于|在|到|至|于)?\s*(?:左下角|右下角|左上角|右上角|左边|左侧|左方|右边|右侧|右方|上方|上面|顶部|下方|下面|底部)/g,
      ' ',
    )
    .replace(/放在|放到|放置在|置于|附近|旁边|周围|原版|原图|原模块|原画板/g, ' ')
    .replace(/纵向|竖向|垂直|横向|水平|排列/g, ' ')
    .replace(/画板|图层|模块|元素|内容|对象|节点|frame|layer|module|element|object|node/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
