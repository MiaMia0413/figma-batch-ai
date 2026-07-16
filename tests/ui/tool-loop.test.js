import { afterEach, describe, expect, it, vi } from 'vitest';
import { runToolLoop } from '../../src/ui/tool-loop.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runToolLoop', () => {
  it('runs a model-selected read-only tool and returns the model summary', async () => {
    stubModelResponses([
      toolResponse('design_qa_check', { scope: 'page' }),
      textResponse('检查完成，没有发现高优先级问题。'),
    ]);
    const bridge = {
      call: vi.fn(async () => ({ scannedNodes: 12, issues: [] })),
    };
    const appendMessage = vi.fn();

    const result = await runToolLoop({
      settings: settings(),
      messages: messages('检查当前设计稿中的设计一致性问题'),
      bridge,
      appendMessage,
      signal: new AbortController().signal,
    });

    expect(result).toBe('检查完成，没有发现高优先级问题。');
    expect(bridge.call).toHaveBeenCalledTimes(1);
    expect(bridge.call.mock.calls[0].slice(0, 2)).toEqual(['design_qa_check', { scope: 'page' }]);
    expect(appendMessage).toHaveBeenCalledWith('tool', '正在执行 design_qa_check {"scope":"page"}');
  });

  it('rejects a model-invented mutation target before it reaches Figma', async () => {
    stubModelResponses([
      toolResponse('batch_set_fill', {
        scope: 'page',
        target: '次按钮',
        color: '#FF0000',
      }),
      textResponse('我需要你确认具体要修改哪个按钮。'),
    ]);
    const bridge = { call: vi.fn() };
    const appendMessage = vi.fn();

    const result = await runToolLoop({
      settings: settings(),
      messages: messages('让主按钮看起来更突出'),
      bridge,
      appendMessage,
      signal: new AbortController().signal,
    });

    expect(result).toBe('我需要你确认具体要修改哪个按钮。');
    expect(bridge.call).not.toHaveBeenCalled();
    expect(appendMessage).toHaveBeenCalledWith(
      'tool',
      expect.stringContaining('目标“次按钮”没有出现在用户请求中'),
    );
  });
});

function stubModelResponses(responses) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => responses.shift(),
    })),
  );
}

function toolResponse(name, args) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'tool-call-1',
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

function textResponse(content) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

function settings() {
  return { endpoint: 'https://example.com/v1', apiKey: 'test-key', model: 'test-model' };
}

function messages(prompt) {
  return [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: prompt },
  ];
}
