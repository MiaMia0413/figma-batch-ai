import { describe, expect, it } from 'vitest';
import { createEditPlan, enrichArgsFromPrompt, normalizeTarget } from '../../src/ui/edit-plan.js';

describe('createEditPlan', () => {
  it('plans a page-level fill change', () => {
    expect(createEditPlan('把所有主按钮背景色改成 #4BC430')).toMatchObject({
      toolName: 'batch_set_fill',
      args: {
        target: '所有主按钮',
        color: '#4BC430',
        scope: 'page',
        targetKind: 'control',
        includeText: false,
      },
    });
  });

  it('plans a selection-level corner radius change', () => {
    expect(createEditPlan('把选中的卡片圆角改成 12px')).toMatchObject({
      toolName: 'batch_set_corner_radius',
      args: {
        target: '选中的卡片',
        radius: 12,
        scope: 'selection',
      },
    });
  });

  it('plans text replacement without replacing the full text node', () => {
    expect(createEditPlan('把立即购买改成去使用')).toMatchObject({
      toolName: 'batch_set_text',
      args: {
        target: '立即购买',
        text: '去使用',
        replaceOnly: true,
      },
    });
  });

  it('plans a full text update inside a named container', () => {
    expect(createEditPlan('将登录弹窗的标题文字改为欢迎回来')).toMatchObject({
      toolName: 'batch_set_text',
      args: {
        target: '标题',
        containerTarget: '登录弹窗',
        text: '欢迎回来',
        replaceOnly: false,
      },
    });
  });

  it('recognizes a container and text role without a possessive delimiter', () => {
    expect(createEditPlan('把登录弹窗标题改成欢迎回来')).toMatchObject({
      toolName: 'batch_set_text',
      args: {
        target: '标题',
        containerTarget: '登录弹窗',
        text: '欢迎回来',
        replaceOnly: false,
      },
    });
  });

  it('treats an ambiguous English rename as visible text replacement', () => {
    expect(createEditPlan('rename Sign in to Continue')).toMatchObject({
      toolName: 'batch_set_text',
      args: {
        target: 'Sign in',
        text: 'Continue',
        replaceOnly: true,
      },
    });
  });

  it('plans layer rename modes without guessing names', () => {
    expect(createEditPlan('给所有图标图层名称添加前缀 Icon')).toMatchObject({
      toolName: 'batch_rename_layers',
      args: {
        target: '所有图标',
        mode: 'prefix',
        text: 'Icon',
      },
    });
  });

  it('plans duplicate count, placement, and layout', () => {
    expect(createEditPlan('复制 2 个登录模块放到右下角纵向排列')).toMatchObject({
      toolName: 'duplicate_layers',
      args: {
        target: '登录模块',
        count: 2,
        placement: 'bottom-right',
        layout: 'vertical',
      },
    });
  });

  it.each([
    ['把选中的卡片宽度改成 320px', { toolName: 'batch_resize', args: { width: 320 } }],
    ['把选中的卡片尺寸改成 320x200', { toolName: 'batch_resize', args: { width: 320, height: 200 } }],
    ['将所有按钮透明度改成 50%', { toolName: 'batch_set_opacity', args: { opacity: 0.5 } }],
    ['显示所有隐藏的提示条', { toolName: 'batch_set_visible', args: { visible: true } }],
  ])('plans explicit property edits: %s', (prompt, expected) => {
    expect(createEditPlan(prompt)).toMatchObject(expected);
  });

  it.each(['把主按钮改成胶囊按钮', '把主按钮的边框颜色改成 #ff0000', '把标题改成欢迎回来'])(
    'defers ambiguous or unsupported edits to the model: %s',
    (prompt) => {
      expect(createEditPlan(prompt)).toBeNull();
    },
  );

  it('returns null for unsupported free-form requests', () => {
    expect(createEditPlan('让整个页面看起来更高级')).toBeNull();
  });
});

describe('prompt argument guards', () => {
  it('normalizes user targets before validation', () => {
    expect(normalizeTarget('所有主按钮 #4BC430')).toBe('主');
  });

  it('enriches model arguments from deterministic intent', () => {
    const args = { target: '主按钮' };
    enrichArgsFromPrompt('batch_set_fill', args, '把所有主按钮背景色改成 #4BC430');
    expect(args).toMatchObject({
      target: '主按钮',
      color: '#4BC430',
      scope: 'page',
      targetKind: 'control',
    });
  });
});
