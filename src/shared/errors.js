export const ERROR_CODES = Object.freeze({
  PLUGIN: 'PLUGIN_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  SAFETY: 'SAFETY_ERROR',
  CANCELLED: 'CANCELLED',
});

export class PluginError extends Error {
  constructor(message, { code = ERROR_CODES.PLUGIN, details, cause } = {}) {
    super(String(message || '插件执行失败。'), cause === undefined ? undefined : { cause });
    this.name = 'PluginError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class ValidationError extends PluginError {
  constructor(message, options = {}) {
    super(message, { ...options, code: ERROR_CODES.VALIDATION });
    this.name = 'ValidationError';
  }
}

export class SafetyError extends PluginError {
  constructor(message, options = {}) {
    super(message, { ...options, code: ERROR_CODES.SAFETY });
    this.name = 'SafetyError';
  }
}

export class CancelledError extends PluginError {
  constructor(message = '操作已取消。', options = {}) {
    super(message, { ...options, code: ERROR_CODES.CANCELLED });
    this.name = 'CancelledError';
  }
}

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return {
      error: String(error),
      code: ERROR_CODES.PLUGIN,
      name: 'PluginError',
    };
  }

  return compactError({
    error: error.message || '插件执行失败。',
    code: typeof error.code === 'string' && error.code ? error.code : ERROR_CODES.PLUGIN,
    name: error.name || 'Error',
    details: error.details,
  });
}

export function deserializeError(value, fallbackMessage = '命令执行失败') {
  const payload = typeof value === 'string' ? { error: value } : value || {};
  const error = new Error(String(payload.error || payload.message || fallbackMessage));
  error.name = String(payload.name || 'Error');
  error.code = String(payload.code || ERROR_CODES.PLUGIN);
  if (payload.details !== undefined) error.details = payload.details;
  return error;
}

export function isCancelledError(error) {
  return (
    error?.code === ERROR_CODES.CANCELLED || error?.name === 'CancelledError' || error?.name === 'AbortError'
  );
}

export function isSafetyError(error) {
  return error?.code === ERROR_CODES.SAFETY || error?.name === 'SafetyError';
}

function compactError(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
