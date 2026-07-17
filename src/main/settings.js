import { assertAllowedEndpoint } from '../shared/allowed-endpoints.js';
import { ValidationError } from '../shared/errors.js';

export const STORAGE_KEY = 'figma-batch-ai-settings-v1';

export const DEFAULT_SETTINGS = {
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
};

export async function getSettings() {
  return normalizeSettings(await figma.clientStorage.getAsync(STORAGE_KEY));
}

export async function saveSettings(args) {
  const next = normalizeSettings(args);

  assertAllowedEndpoint(next.endpoint);
  if (!next.model) throw new ValidationError('请填写模型名称。');

  await figma.clientStorage.setAsync(STORAGE_KEY, next);
  return {
    endpoint: next.endpoint,
    model: next.model,
    hasApiKey: Boolean(next.apiKey),
  };
}

function normalizeSettings(value) {
  return {
    endpoint: String(value?.endpoint || DEFAULT_SETTINGS.endpoint).trim(),
    model: String(value?.model || DEFAULT_SETTINGS.model).trim(),
    apiKey: String(value?.apiKey || DEFAULT_SETTINGS.apiKey).trim(),
  };
}
