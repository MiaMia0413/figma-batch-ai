import { ValidationError } from './errors.js';

export const ALLOWED_ENDPOINT_PATTERNS = Object.freeze([
  'https://api.openai.com',
  'https://api.deepseek.com',
  'https://api.moonshot.cn',
  'https://dashscope.aliyuncs.com',
  'https://*.maas.aliyuncs.com',
  'https://api.anthropic.com',
  'https://*.openai.azure.com',
  'https://open.bigmodel.cn',
  'https://api.lingyiwanwu.com',
  'https://api.groq.com',
  'https://openrouter.ai',
  'https://aihubmix.com',
]);

export function assertAllowedEndpoint(endpoint) {
  const value = String(endpoint || '').trim();
  if (!/^https:\/\//i.test(value)) {
    throw new ValidationError('Endpoint 必须以 https:// 开头。');
  }

  const hostname = endpointHostname(value);
  if (!hostname) throw new ValidationError('Endpoint 地址格式无效。');
  if (!isAllowedEndpointHost(hostname)) {
    throw new ValidationError(
      `Endpoint 主机名不在插件允许的网络域名列表中：${hostname}。请使用设置面板中的预设提供商。`,
    );
  }

  return value;
}

export function isAllowedEndpointHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) return false;

  return ALLOWED_ENDPOINT_PATTERNS.some((pattern) => {
    const allowedHost = pattern.slice('https://'.length).toLowerCase();
    if (!allowedHost.startsWith('*.')) return host === allowedHost;
    const suffix = allowedHost.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  });
}

function endpointHostname(endpoint) {
  if (/\s/.test(endpoint)) return '';
  const match = endpoint.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i);
  if (!match || match[1].includes('@')) return '';

  const parts = match[1].split(':');
  if (parts.length > 2) return '';
  const [hostname, port = ''] = parts;
  if (port && port !== '443') return '';
  if (!/^[a-z0-9.-]+$/i.test(hostname) || hostname.startsWith('.') || hostname.includes('..')) return '';
  return hostname.toLowerCase().replace(/\.$/, '');
}
