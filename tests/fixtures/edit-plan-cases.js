export const SUPPORTED_EDIT_PLAN_CASES = [
  planCase('把所有主按钮背景色改成 #4BC430', 'batch_set_fill', {
    target: '所有主按钮',
    color: '#4BC430',
    scope: 'page',
  }),
  planCase('把登录弹窗的标题文字颜色改成 #FFFFFF', 'batch_set_fill', {
    target: '标题',
    containerTarget: '登录弹窗',
    color: '#FFFFFF',
    includeText: true,
  }),
  planCase('set selected cards background to #112233', 'batch_set_fill', {
    target: 'selected cards',
    color: '#112233',
    scope: 'selection',
  }),
  planCase('移除所有提示条的背景色', 'batch_remove_fill', { target: '所有提示条' }),
  planCase('remove selected cards fill', 'batch_remove_fill', {
    target: 'selected cards',
    scope: 'selection',
  }),
  planCase('把所有卡片圆角改成 16px', 'batch_set_corner_radius', {
    target: '所有卡片',
    radius: 16,
  }),
  planCase('set selected cards corner radius to 12px', 'batch_set_corner_radius', {
    target: 'selected cards',
    radius: 12,
    scope: 'selection',
  }),
  planCase('round selected cards to 20px', 'batch_set_corner_radius', {
    target: 'selected cards',
    radius: 20,
  }),
  planCase('将所有禁用按钮透明度改成 40%', 'batch_set_opacity', {
    target: '所有禁用按钮',
    opacity: 0.4,
  }),
  planCase('change selected overlays opacity to 0.6', 'batch_set_opacity', {
    target: 'selected overlays',
    opacity: 0.6,
    scope: 'selection',
  }),
  planCase('把选中的卡片宽度改成 320px', 'batch_resize', {
    target: '选中的卡片',
    width: 320,
    scope: 'selection',
  }),
  planCase('把所有头像高度改成 48px', 'batch_resize', { target: '所有头像', height: 48 }),
  planCase('把登录弹窗尺寸改成 480x640', 'batch_resize', {
    target: '登录弹窗',
    width: 480,
    height: 640,
  }),
  planCase('set selected cards width to 360px', 'batch_resize', {
    target: 'selected cards',
    width: 360,
    scope: 'selection',
  }),
  planCase('change hero image height to 240px', 'batch_resize', {
    target: 'hero image',
    height: 240,
  }),
  planCase('resize selected dialog to 520x680', 'batch_resize', {
    target: 'selected dialog',
    width: 520,
    height: 680,
    scope: 'selection',
  }),
  planCase('隐藏所有促销角标', 'batch_set_visible', { target: '所有促销角标', visible: false }),
  planCase('显示选中的提示条', 'batch_set_visible', {
    target: '选中的提示条',
    visible: true,
    scope: 'selection',
  }),
  planCase('hide legacy badges', 'batch_set_visible', { target: 'legacy badges', visible: false }),
  planCase('show selected helper text', 'batch_set_visible', {
    target: 'selected helper text',
    visible: true,
  }),
  planCase('把所有兑换按钮文案改成去使用', 'batch_set_text', {
    target: '所有兑换按钮',
    text: '去使用',
    replaceOnly: false,
  }),
  planCase('将登录弹窗的标题文字改为欢迎回来', 'batch_set_text', {
    target: '标题',
    containerTarget: '登录弹窗',
    text: '欢迎回来',
    replaceOnly: false,
  }),
  planCase('change selected buttons label to Continue', 'batch_set_text', {
    target: 'selected buttons',
    text: 'Continue',
    replaceOnly: false,
    scope: 'selection',
  }),
  planCase('把立即购买改成去使用', 'batch_set_text', {
    target: '立即购买',
    text: '去使用',
    replaceOnly: true,
  }),
  planCase('replace Sign in with Continue', 'batch_set_text', {
    target: 'Sign in',
    text: 'Continue',
    replaceOnly: true,
  }),
  planCase('复制 2 个登录模块放到右下角纵向排列', 'duplicate_layers', {
    target: '登录模块',
    count: 2,
    placement: 'bottom-right',
    layout: 'vertical',
  }),
  planCase('把选中的卡片复制三份放到右边', 'duplicate_layers', {
    target: '选中的卡片',
    count: 3,
    placement: 'right',
    scope: 'selection',
  }),
  planCase('duplicate pricing card', 'duplicate_layers', { target: 'pricing card', count: 1 }),
  planCase('把所有旧版图标重命名为 Icon', 'batch_rename_layers', {
    target: '所有旧版图标',
    mode: 'replace',
    text: 'Icon',
  }),
  planCase('将选中的卡片图层名称改为 Product Card', 'batch_rename_layers', {
    target: '选中的卡片',
    mode: 'replace',
    text: 'Product Card',
    scope: 'selection',
  }),
  planCase('给所有图标图层名称添加前缀 Icon', 'batch_rename_layers', {
    target: '所有图标',
    mode: 'prefix',
    text: 'Icon',
  }),
  planCase('为选中的卡片名称添加后缀 Old', 'batch_rename_layers', {
    target: '选中的卡片',
    mode: 'suffix',
    text: 'Old',
  }),
  planCase('rename selected cards to Product Card', 'batch_rename_layers', {
    target: 'selected cards',
    mode: 'replace',
    text: 'Product Card',
  }),
  planCase('add prefix Icon to all legacy icons', 'batch_rename_layers', {
    target: 'all legacy icons',
    mode: 'prefix',
    text: 'Icon',
  }),
  planCase('apply suffix Archived to selected cards', 'batch_rename_layers', {
    target: 'selected cards',
    mode: 'suffix',
    text: 'Archived',
  }),
];

export const DEFERRED_EDIT_PLAN_CASES = [
  '把主按钮改成胶囊按钮',
  '把主按钮的边框颜色改成 #ff0000',
  '将所有正文的字号改为 16px',
  '把卡片之间的间距设为 24px',
  '给所有弹窗添加柔和阴影',
  '把背景改成蓝紫色渐变',
  '让整个页面看起来更高级',
  '优化当前页面的视觉层级',
  '生成一个完整的电商首页',
  '删除所有没有使用的图层',
  '把这些元素改成自动布局',
  '把标题改成欢迎回来',
  '用清晰的产品名称重命名相似图层',
  'make the selected card more polished',
  'change the button into a pill button',
];

function planCase(prompt, toolName, args) {
  return { prompt, expected: { toolName, args } };
}
