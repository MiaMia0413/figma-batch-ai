import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/shared/errors.js';
import { prepareToolCall } from '../../src/ui/tool-prepare.js';

describe('prepareToolCall', () => {
  it('enriches model arguments from the user prompt before the internal validation pass', () => {
    const prepared = prepareToolCall(
      'batch_set_fill',
      { scope: 'page', target: '主按钮', color: '#4BC430' },
      {
        userPrompt: '把所有主按钮背景色改成 #4BC430',
        userContext: '把所有主按钮背景色改成 #4BC430',
        source: 'model',
      },
    );

    expect(prepared).toEqual(
      expect.objectContaining({
        skipped: false,
        args: expect.objectContaining({
          target: '主按钮',
          color: '#4BC430',
          targetKind: 'control',
        }),
      }),
    );
  });

  it('accepts trusted rule metadata while applying the same target-source check', () => {
    const prepared = prepareToolCall(
      'batch_set_fill',
      {
        scope: 'page',
        target: '所有主按钮',
        color: '#4BC430',
        targetKind: 'control',
      },
      {
        userPrompt: '把所有主按钮背景色改成 #4BC430',
        userContext: '把所有主按钮背景色改成 #4BC430',
        source: 'rule',
      },
    );

    expect(prepared.skipped).toBe(false);
    expect(prepared.args.targetKind).toBe('control');
  });

  it('rejects a target that was not present in user context for either source', () => {
    const prepared = prepareToolCall(
      'batch_set_fill',
      { scope: 'page', target: '次按钮', color: '#FF0000' },
      {
        userPrompt: '让主按钮更突出',
        userContext: '让主按钮更突出',
        source: 'rule',
      },
    );

    expect(prepared.skipped).toBe(true);
    expect(prepared.reason).toContain('目标“次按钮”没有出现在用户请求中');
  });

  it('rejects invalid model schema values', () => {
    expect(() =>
      prepareToolCall(
        'batch_set_fill',
        { scope: 'page', target: '主按钮', color: 123 },
        { userPrompt: '修改主按钮', source: 'model' },
      ),
    ).toThrow(ValidationError);
  });

  it('rejects model-supplied internal fields', () => {
    expect(() =>
      prepareToolCall(
        'batch_set_fill',
        {
          scope: 'page',
          target: '主按钮',
          color: '#4BC430',
          nodeIds: ['invented-node'],
        },
        { userPrompt: '修改主按钮', source: 'model' },
      ),
    ).toThrow('batch_set_fill 不支持参数：nodeIds');
  });
});
