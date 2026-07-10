import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  ERROR_CODES,
  PluginError,
  SafetyError,
  ValidationError,
  deserializeError,
  isCancelledError,
  serializeError,
} from '../../src/shared/errors.js';

describe('structured errors', () => {
  it.each([
    [new PluginError('插件失败。'), ERROR_CODES.PLUGIN, 'PluginError'],
    [new ValidationError('参数无效。'), ERROR_CODES.VALIDATION, 'ValidationError'],
    [new SafetyError('范围过大。'), ERROR_CODES.SAFETY, 'SafetyError'],
    [new CancelledError(), ERROR_CODES.CANCELLED, 'CancelledError'],
  ])('serializes %s with a stable code', (error, code, name) => {
    expect(serializeError(error)).toMatchObject({
      error: error.message,
      code,
      name,
    });
  });

  it('round-trips message, code, name, and details', () => {
    const serialized = serializeError(
      new ValidationError('数量无效。', {
        details: { field: 'count' },
      }),
    );
    const restored = deserializeError(serialized);

    expect(restored).toMatchObject({
      message: '数量无效。',
      code: ERROR_CODES.VALIDATION,
      name: 'ValidationError',
      details: { field: 'count' },
    });
  });

  it('recognizes structured and browser cancellation errors', () => {
    expect(isCancelledError(new CancelledError())).toBe(true);
    expect(isCancelledError({ name: 'AbortError' })).toBe(true);
    expect(isCancelledError(new Error('普通错误'))).toBe(false);
  });
});
