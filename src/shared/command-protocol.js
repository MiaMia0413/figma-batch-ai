import { ValidationError } from './errors.js';
import { TOOL_REGISTRY_BY_NAME } from './tool-registry.js';

const INTERNAL_PROPERTIES = {
  nodeIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
  deepSearch: { type: 'boolean' },
  fallbackFont: {
    type: 'object',
    properties: {
      family: { type: 'string' },
      style: { type: 'string' },
    },
    required: ['family', 'style'],
    additionalProperties: false,
  },
  targetKind: { type: 'string' },
  targetQuery: { type: 'string' },
};

export function validateToolArguments(name, value, { allowInternal = false } = {}) {
  const metadata = TOOL_REGISTRY_BY_NAME.get(name);
  if (!metadata) throw new ValidationError(`不支持的工具：${name}`);
  if (!isPlainObject(value)) throw new ValidationError(`${name} 参数必须是对象。`);

  const schema = metadata.parameters;
  const properties = allowInternal ? { ...schema.properties, ...INTERNAL_PROPERTIES } : schema.properties;
  const allowed = new Set(Object.keys(properties));

  for (const key of schema.required || []) {
    if (value[key] === undefined) throw new ValidationError(`${name}.${key} 是必填参数。`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} 不支持参数：${key}`);
    assertSchemaValue(`${name}.${key}`, item, properties[key]);
  }

  return value;
}

function assertSchemaValue(path, value, schema) {
  if (!schema) return;
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new ValidationError(`${path} 必须是有限数字。`);
  }
  if (schema.type === 'string' && typeof value !== 'string') {
    throw new ValidationError(`${path} 必须是字符串。`);
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    throw new ValidationError(`${path} 必须是布尔值。`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new ValidationError(`${path} 必须是数组。`);
    if (schema.minItems && value.length < schema.minItems) {
      throw new ValidationError(`${path} 至少需要 ${schema.minItems} 项。`);
    }
    value.forEach((item, index) => assertSchemaValue(`${path}[${index}]`, item, schema.items));
  }
  if (schema.type === 'object') {
    if (!isPlainObject(value)) throw new ValidationError(`${path} 必须是对象。`);
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (value[key] === undefined) throw new ValidationError(`${path}.${key} 是必填参数。`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) throw new ValidationError(`${path} 不支持参数：${key}`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      assertSchemaValue(`${path}.${key}`, item, properties[key]);
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new ValidationError(`${path} 必须是以下值之一：${schema.enum.join(', ')}。`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
