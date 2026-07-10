export function semanticBoundsOf(node) {
  if (node.absoluteBoundingBox) return node.absoluteBoundingBox;
  if ('width' in node && 'height' in node) return { x: 0, y: 0, width: node.width, height: node.height };
  return null;
}

export function semanticContainsBounds(outer, inner) {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

export function semanticIntersectsBounds(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function bucket(value, size) {
  return Math.round(value / size);
}
