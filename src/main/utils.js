export function finiteNumber(value, name, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} 必须是数字。`);
  if (number < min || number > max) throw new Error(`${name} 必须在 ${min} 到 ${max} 之间。`);
  return number;
}

export function parseHexColor(value) {
  const hex = normalizeHex(value).slice(1);
  const int = Number.parseInt(hex, 16);
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  };
}

export function normalizeHex(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) throw new Error('颜色必须是类似 #2563EB 的十六进制色值。');
  const hex = match[1].length === 3
    ? match[1].split('').map((char) => char + char).join('')
    : match[1];
  return `#${hex.toUpperCase()}`;
}

export function rgbToHex(color) {
  const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();
}

export function round(value) {
  return Math.round(value * 100) / 100;
}

export function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
