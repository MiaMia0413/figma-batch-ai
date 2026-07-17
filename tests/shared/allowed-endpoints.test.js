import { describe, expect, it } from 'vitest';
import { assertAllowedEndpoint, isAllowedEndpointHost } from '../../src/shared/allowed-endpoints.js';

describe('allowed endpoints', () => {
  it.each([
    'https://api.openai.com/v1',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://tenant.maas.aliyuncs.com/v1',
    'https://resource.openai.azure.com/openai',
    'https://api.openai.com:443/v1',
  ])('accepts a manifest-allowed endpoint: %s', (endpoint) => {
    expect(assertAllowedEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    'https://evil.example.com/v1',
    'https://api.openai.com.evil.example/v1',
    'https://maas.aliyuncs.com/v1',
    'http://api.openai.com/v1',
    'https://api.openai.com:8443/v1',
    'https://user@api.openai.com/v1',
    'not-a-url',
  ])('rejects an endpoint unavailable to the plugin runtime: %s', (endpoint) => {
    expect(() => assertAllowedEndpoint(endpoint)).toThrow();
  });

  it('matches exact and wildcard hosts without accepting lookalikes', () => {
    expect(isAllowedEndpointHost('api.groq.com')).toBe(true);
    expect(isAllowedEndpointHost('tenant.maas.aliyuncs.com')).toBe(true);
    expect(isAllowedEndpointHost('api.groq.com.evil.example')).toBe(false);
  });
});
