import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveSettings } from '../../src/main/settings.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveSettings', () => {
  it('persists an allowed endpoint', async () => {
    const setAsync = vi.fn();
    vi.stubGlobal('figma', { clientStorage: { setAsync } });

    await expect(
      saveSettings({
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
      }),
    ).resolves.toEqual({
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      hasApiKey: true,
    });
    expect(setAsync).toHaveBeenCalledOnce();
  });

  it('rejects a host outside the manifest allowlist without writing storage', async () => {
    const setAsync = vi.fn();
    vi.stubGlobal('figma', { clientStorage: { setAsync } });

    await expect(
      saveSettings({
        endpoint: 'https://evil.example.com/v1',
        model: 'test-model',
        apiKey: '',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('不在插件允许的网络域名列表中'),
    });
    expect(setAsync).not.toHaveBeenCalled();
  });

  it('keeps model validation before writing storage', async () => {
    const setAsync = vi.fn();
    vi.stubGlobal('figma', { clientStorage: { setAsync } });

    await expect(
      saveSettings({
        endpoint: 'https://api.openai.com/v1',
        model: ' ',
        apiKey: '',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: '请填写模型名称。',
    });
    expect(setAsync).not.toHaveBeenCalled();
  });
});
