import { afterEach, describe, expect, it, vi } from 'vitest';
import { runToolLoop } from '../../src/ui/tool-loop.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runToolLoop', () => {
  it('runs a deterministic edit plan through preview, confirmation, and explicit targets', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const preview = {
      message: '正在预览 2 个图层。',
      nodeIds: ['button-1', 'button-2'],
      targetCount: 2,
      targetQuery: '主',
    };
    const bridge = {
      call: vi
        .fn()
        .mockResolvedValueOnce(preview)
        .mockResolvedValueOnce({ changed: 2, message: '已更新填充色：修改了 2 个图层。' }),
    };
    const confirm = vi.fn(async () => preview);

    const result = await runToolLoop({
      settings: settings(),
      messages: messages('把所有主按钮背景色改成 #4BC430'),
      bridge,
      appendMessage: vi.fn(),
      signal: new AbortController().signal,
      confirm,
    });

    expect(result).toBe('已更新填充色：修改了 2 个图层。');
    expect(confirm).toHaveBeenCalledWith(
      'batch_set_fill',
      expect.objectContaining({ target: '所有主按钮', color: '#4BC430' }),
      preview,
      bridge,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(bridge.call).toHaveBeenNthCalledWith(
      1,
      'preview_batch_edit',
      expect.objectContaining({
        toolName: 'batch_set_fill',
        toolArgs: expect.objectContaining({ target: '所有主按钮', color: '#4BC430' }),
      }),
      expect.any(Object),
    );
    expect(bridge.call).toHaveBeenNthCalledWith(
      2,
      'batch_set_fill',
      expect.objectContaining({ nodeIds: ['button-1', 'button-2'] }),
      expect.any(Object),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops a deterministic edit after the user rejects its preview', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const preview = { nodeIds: ['card-1'], targetCount: 1 };
    const bridge = { call: vi.fn(async () => preview) };

    const result = await runToolLoop({
      settings: settings(),
      messages: messages('把选中的卡片圆角改成 12px'),
      bridge,
      appendMessage: vi.fn(),
      signal: new AbortController().signal,
      confirm: vi.fn(async () => null),
    });

    expect(result).toBe('用户在预览后取消了本次操作。');
    expect(bridge.call).toHaveBeenCalledTimes(1);
    expect(bridge.call).toHaveBeenCalledWith('preview_batch_edit', expect.any(Object), expect.any(Object));
    expect(fetch).not.toHaveBeenCalled();
  });

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

  it('rejects a model-invented container target before it reaches Figma', async () => {
    stubModelResponses([
      toolResponse('batch_set_fill', {
        scope: 'page',
        target: '标题',
        containerTarget: '登录弹窗',
        includeText: true,
        color: '#FF0000',
      }),
      textResponse('请说明要修改哪个容器里的标题。'),
    ]);
    const bridge = { call: vi.fn() };
    const appendMessage = vi.fn();

    const result = await runToolLoop({
      settings: settings(),
      messages: messages('让标题更醒目'),
      bridge,
      appendMessage,
      signal: new AbortController().signal,
    });

    expect(result).toBe('请说明要修改哪个容器里的标题。');
    expect(bridge.call).not.toHaveBeenCalled();
    expect(appendMessage).toHaveBeenCalledWith(
      'tool',
      expect.stringContaining('容器目标“登录弹窗”没有出现在用户请求中'),
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
