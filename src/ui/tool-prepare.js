import { validateToolArguments } from '../shared/command-protocol.js';
import { enrichArgsFromPrompt, normalizeTarget } from './edit-plan.js';
import { CONFIRM_TOOLS } from './tools.js';

export function prepareToolCall(
  toolName,
  rawArgs,
  { userPrompt = '', userContext = userPrompt, source = 'model' } = {},
) {
  const args = { ...rawArgs };

  if (source === 'model') {
    validateToolArguments(toolName, args);
    enrichArgsFromPrompt(toolName, args, userPrompt);
  } else if (source !== 'rule') {
    throw new Error(`不支持的工具调用来源：${source}`);
  }

  validateToolArguments(toolName, args, { allowInternal: true });

  const reason = validateTargetFromPrompt(toolName, args, userContext);
  return reason ? { toolName, args, skipped: true, reason } : { toolName, args, skipped: false, reason: '' };
}

export function validateTargetFromPrompt(name, args, userContext) {
  if (!CONFIRM_TOOLS.has(name)) return '';

  const prompt = normalizeTarget(userContext);
  const fields = [
    ['目标', args.target],
    ['容器目标', args.containerTarget],
  ];

  for (const [label, value] of fields) {
    if (!value) continue;
    const target = normalizeTarget(value);
    if (!target || prompt.includes(target) || targetTokensAllowed(prompt, target)) continue;
    return `${label}“${value}”没有出现在用户请求中，请先澄清，不要猜测其他目标。`;
  }

  return '';
}

function targetTokensAllowed(prompt, target) {
  const parts = target.split(/\s+/).filter(Boolean);
  if (!parts.length) return true;
  return parts.every((part) => prompt.includes(part));
}
