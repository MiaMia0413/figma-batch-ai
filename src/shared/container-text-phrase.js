const CONTAINER_TEXT_PATTERN = /^(.+?)(?:的|\s+)?(标题|副标题|主标题|文案|文字|文本|title|subtitle)$/i;
const SCOPE_ONLY_PATTERN = /^(?:所有|全部|当前|选中|所选)$/i;

export function splitContainerTextTarget(value) {
  const text = cleanTargetPhrase(value).replace(/(标题|副标题|主标题)(?:文案|文字|文本)$/i, '$1');
  const match = text.match(CONTAINER_TEXT_PATTERN);
  if (!match) return null;

  const container = cleanTargetPhrase(match[1]);
  const child = cleanTargetPhrase(match[2]);
  if (!container || !child || SCOPE_ONLY_PATTERN.test(container)) return null;
  return { container, child };
}

function cleanTargetPhrase(value) {
  return String(value || '')
    .trim()
    .replace(/[“”‘’]/g, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}
