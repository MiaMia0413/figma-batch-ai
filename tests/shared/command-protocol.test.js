import { describe, expect, it } from 'vitest';
import { validateToolArguments } from '../../src/shared/command-protocol.js';

describe('validateToolArguments', () => {
  it('accepts schema fields and rejects unknown model fields', () => {
    expect(
      validateToolArguments('batch_resize', {
        target: 'Promo card',
        scope: 'page',
        width: 320,
      }),
    ).toMatchObject({ width: 320 });

    expect(() =>
      validateToolArguments('batch_resize', {
        target: 'Promo card',
        width: 320,
        nodeIds: ['injected'],
      }),
    ).toThrow('不支持参数：nodeIds');
  });

  it('allows validated UI execution fields only on the internal protocol', () => {
    expect(
      validateToolArguments(
        'batch_set_text',
        {
          target: '旧文案',
          text: '新文案',
          nodeIds: ['node-1'],
          deepSearch: true,
          fallbackFont: { family: 'Inter', style: 'Regular' },
        },
        { allowInternal: true },
      ),
    ).toMatchObject({ nodeIds: ['node-1'] });

    expect(() =>
      validateToolArguments('batch_set_text', { text: '新文案', nodeIds: [] }, { allowInternal: true }),
    ).toThrow('至少需要 1 项');
  });

  it('rejects wrong primitive and enum types', () => {
    expect(() => validateToolArguments('batch_resize', { width: '320' })).toThrow('必须是有限数字');
    expect(() => validateToolArguments('inspect_canvas', { scope: 'document' })).toThrow('必须是以下值之一');
  });
});
