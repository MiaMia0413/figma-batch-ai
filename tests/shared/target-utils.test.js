import { describe, expect, it } from 'vitest';
import {
  compactTargetText,
  hasControlTargetIntent,
  matchesTargetQuery,
  normalizeDuplicateTargetQuery,
  normalizeTargetQuery,
} from '../../src/shared/target-utils.js';

describe('target-utils', () => {
  it.each([
    ['所有主按钮图层', '主'],
    ['所有按钮', '按钮'],
    ['all primary buttons', 'primary'],
    ['all buttons', 'button'],
    ['所有 Checkout CTA', 'checkout'],
  ])('normalizes target qualifiers: %s', (input, expected) => {
    expect(normalizeTargetQuery(input)).toBe(expected);
  });

  it('optionally removes hex colors', () => {
    expect(normalizeTargetQuery('把 #4BC430 主按钮改色', { stripHexColors: true })).toBe('把 主 改色');
  });

  it('optionally removes Chinese possessives', () => {
    expect(normalizeTargetQuery('对话框的标题', { stripPossessive: true })).toBe('对话框 标题');
  });

  it.each(['主按钮', 'primary button', 'CTA', '搜索框'])('detects control intent: %s', (value) => {
    expect(hasControlTargetIntent(value)).toBe(true);
  });

  it('does not classify arbitrary layers as controls', () => {
    expect(hasControlTargetIntent('背景插图')).toBe(false);
  });

  it('compacts punctuation and whitespace', () => {
    expect(compactTargetText('主按钮 / Primary_Button')).toBe('主按钮PrimaryButton');
  });

  it('matches normalized multi-part queries across node fields', () => {
    expect(matchesTargetQuery(['Checkout / Primary_Button', '立即支付'], 'primary checkout')).toBe(true);
    expect(matchesTargetQuery(['Checkout / Primary_Button', '立即支付'], 'all primary buttons')).toBe(true);
    expect(matchesTargetQuery(['Primary Button'], '所有按钮')).toBe(true);
    expect(matchesTargetQuery(['Primary Button'], '所有卡片')).toBe(false);
    expect(matchesTargetQuery(['Product Card'], '所有卡片')).toBe(true);
    expect(matchesTargetQuery(['Checkout / Primary_Button', '立即支付'], 'secondary checkout')).toBe(false);
  });

  it.each([
    ['复制两个登录卡片到右下角', '登录卡片'],
    ['selected Hero frame', 'hero'],
    ['主按钮横向复制一份', '主按钮'],
    ['我选中的内容', ''],
    ['我当前所选的模块', ''],
  ])('removes duplicate-only language: %s', (input, expected) => {
    expect(normalizeDuplicateTargetQuery(input)).toBe(expected);
  });
});
