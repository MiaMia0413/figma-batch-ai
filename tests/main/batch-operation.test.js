import { describe, expect, it, vi } from 'vitest';
import { CancelledError, SafetyError } from '../../src/shared/errors.js';
import { runNodeBatch } from '../../src/main/tools/batch-operation.js';

const context = {
  yieldToHost: vi.fn(),
  yieldIfNeeded: vi.fn(),
};

describe('runNodeBatch', () => {
  it('records a failed node and continues the batch', async () => {
    const nodes = [
      { id: '1', name: '成功一' },
      { id: '2', name: '失败' },
      { id: '3', name: '成功二' },
    ];
    const visited = [];

    const result = await runNodeBatch(nodes, context, (node) => {
      visited.push(node.id);
      if (node.id === '2') throw new Error('节点只读。');
    });

    expect(visited).toEqual(['1', '2', '3']);
    expect(result.changed).toBe(2);
    expect(result.skipped).toEqual([
      {
        id: '2',
        name: '失败',
        reason: '节点只读。',
      },
    ]);
  });

  it.each([new CancelledError(), new SafetyError('安全拒绝。')])('does not swallow %s', async (error) => {
    await expect(
      runNodeBatch([{ id: '1', name: '节点' }], context, () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it('collects operation values for successful nodes', async () => {
    const values = await runNodeBatch(
      [
        { id: '1', name: '节点一' },
        { id: '2', name: '节点二' },
      ],
      context,
      (node) => ({ copyOf: node.id }),
    );

    expect(values.changed).toBe(2);
    expect(values.values).toEqual([{ copyOf: '1' }, { copyOf: '2' }]);
  });
});
