import { describe, expect, it } from 'vitest';
import { splitContainerTextTarget } from '../../src/shared/container-text-phrase.js';

describe('splitContainerTextTarget', () => {
  it.each([
    ['登录弹窗的标题', { container: '登录弹窗', child: '标题' }],
    ['登录弹窗标题', { container: '登录弹窗', child: '标题' }],
    ['登录弹窗标题文字', { container: '登录弹窗', child: '标题' }],
    ['“登录弹窗”的标题', { container: '登录弹窗', child: '标题' }],
    ['dialog title', { container: 'dialog', child: 'title' }],
  ])('splits a container and text role: %s', (input, expected) => {
    expect(splitContainerTextTarget(input)).toEqual(expected);
  });

  it.each(['标题', '所有标题', '当前的标题', '立即购买', '产品卡片'])(
    'does not split ambiguous or non-text targets: %s',
    (input) => {
      expect(splitContainerTextTarget(input)).toBeNull();
    },
  );
});
