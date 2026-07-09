import { TOOLS } from './tools.js';

export async function chatCompletion(settings, messages, options = {}) {
  const endpoint = settings.endpoint.replace(/\/+$/, '');
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${text.slice(0, 240)}`);
  }

  return response.json();
}
