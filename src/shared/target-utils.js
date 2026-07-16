const CONTROL_TARGET_RE =
  /\b(button|buttons|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|list item|list items|menu item|menu items|nav item|nav items|input|inputs|field|fields|search|switch|switches|toggle|toggles|checkbox|checkboxes|radio|radios|option|options|selector|selectors|dropdown|dropdowns|toast|toasts|banner|banners)\b|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/i;
const TARGET_QUALIFIER_RE =
  /全部|所有|当前|选中|所选|图层|按钮|按键|控件|选项卡|标签页|标签|徽标|角标|卡片|列表项|菜单项|导航项|入口|输入框|搜索框|开关|复选框|单选框|选项|下拉|选择器|提示条|横幅/g;
const ENGLISH_TARGET_QUALIFIER_RE =
  /\b(all|every|the|selected|current|layer|layers|button|buttons|btn|cta|tab|tabs|chip|chips|tag|tags|badge|badges|card|cards|list item|list items|menu item|menu items|nav item|nav items|input|field|search|switch|toggle|checkbox|radio|option|selector|dropdown|toast|banner)\b/g;
const GENERIC_TARGET_PREFIX_RE = /全部|所有|当前|选中|所选|图层|的/g;
const ENGLISH_GENERIC_TARGET_PREFIX_RE = /\b(all|every|the|selected|current|layer|layers)\b/g;
const CONTROL_CATEGORIES = [
  ['button', /\b(?:button|buttons|btn|cta)\b|按钮|按键/i],
  ['tab', /\b(?:tab|tabs)\b|选项卡|标签页/i],
  ['tag', /\b(?:chip|chips|tag|tags|badge|badges)\b|标签|徽标|角标/i],
  ['card', /\b(?:card|cards)\b|卡片/i],
  ['list-item', /\blist items?\b|列表项/i],
  ['menu-item', /\bmenu items?\b|菜单项/i],
  ['nav-item', /\bnav items?\b|导航项/i],
  ['input', /\b(?:input|inputs|field|fields|search)\b|输入框|搜索框/i],
  ['switch', /\b(?:switch|switches|toggle|toggles)\b|开关/i],
  ['checkbox', /\b(?:checkbox|checkboxes)\b|复选框/i],
  ['radio', /\b(?:radio|radios)\b|单选框/i],
  ['option', /\b(?:option|options|selector|selectors|dropdown|dropdowns)\b|选项|下拉|选择器/i],
  ['toast', /\b(?:toast|toasts)\b|提示条/i],
  ['banner', /\b(?:banner|banners)\b|横幅/i],
  ['control', /控件|入口/i],
];

export function hasControlTargetIntent(value) {
  return CONTROL_TARGET_RE.test(String(value || ''));
}

export function normalizeTargetQuery(value, options = {}) {
  const { stripHexColors = false, stripPossessive = false } = options;
  let text = String(value || '');
  if (stripHexColors) text = text.replace(/#[0-9a-f]{3,8}\b/gi, ' ');

  const normalized = text
    .toLowerCase()
    .replace(/[“”‘’"'`#]/g, ' ')
    .replace(ENGLISH_TARGET_QUALIFIER_RE, ' ')
    .replace(TARGET_QUALIFIER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = normalized || genericControlTarget(text);

  if (stripPossessive) text = text.replace(/[的]/g, ' ');

  return text.replace(/\s+/g, ' ').trim();
}

export function compactTargetText(value) {
  return String(value || '').replace(/[\s\-_/\\|:：,，.。#()[\]{}<>《》「」【】]+/g, '');
}

export function matchesTargetQuery(values, query, options = {}) {
  const normalizeQuery = options.normalizeQuery || normalizeTargetQuery;
  const sourceValues = Array.isArray(values) ? values : [values];
  const genericCategory = genericControlCategory(query);
  if (genericCategory) {
    return sourceValues.some((value) =>
      genericCategory === 'control'
        ? hasControlTargetIntent(value)
        : controlCategories(value).includes(genericCategory),
    );
  }

  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return true;

  const haystack = sourceValues.map(normalizeQuery).join(' ');
  const compactHaystack = compactTargetText(haystack);
  const compactQuery = compactTargetText(normalizedQuery);

  if (haystack.includes(normalizedQuery)) return true;
  if (compactQuery && compactHaystack.includes(compactQuery)) return true;

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part) || compactHaystack.includes(compactTargetText(part)));
}

function genericControlTarget(value) {
  const text = genericControlText(value);
  if (!text || !genericControlCategory(value)) return '';
  return text.replace(/\bbuttons\b/g, 'button').replace(/\bcards\b/g, 'card');
}

function genericControlCategory(value) {
  const text = genericControlText(value);
  if (!text) return '';

  const categories = controlCategories(text);
  if (categories.length !== 1) return '';
  const pattern = CONTROL_CATEGORIES.find(([category]) => category === categories[0])?.[1];
  return pattern && !text.replace(pattern, ' ').replace(/\s+/g, ' ').trim() ? categories[0] : '';
}

function genericControlText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”‘’"'`#]/g, ' ')
    .replace(ENGLISH_GENERIC_TARGET_PREFIX_RE, ' ')
    .replace(GENERIC_TARGET_PREFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function controlCategories(value) {
  const text = String(value || '');
  return CONTROL_CATEGORIES.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
}

export function normalizeDuplicateTargetQuery(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/我(?:当前)?选中的?|我(?:当前)?所选的?/g, ' ')
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
