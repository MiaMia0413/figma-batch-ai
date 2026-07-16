import { validateToolArguments } from '../shared/command-protocol.js';
import { ValidationError } from '../shared/errors.js';
import { chatCompletion } from './model-client.js';
import { createEditPlan, enrichArgsFromPrompt, normalizeTarget } from './edit-plan.js';
import { CONFIRM_TOOLS, TOOLS } from './tools.js';

export async function runToolLoop({ settings, messages, bridge, appendMessage, signal }) {
  let current = [...messages];
  let finalText = '';
  let inspectCount = 0;
  const userPrompt = latestUserPrompt(messages);
  const userContext = recentUserContext(messages);
  const plan = createEditPlan(userPrompt);

  throwIfAborted(signal);

  if (plan) {
    validateToolArguments(plan.toolName, plan.args, { allowInternal: true });
    const runner = CONFIRM_TOOLS.has(plan.toolName) ? runConfirmedTool : runSimpleTool;
    const result = await runner(plan.toolName, { ...plan.args }, bridge, appendMessage, signal);
    return result.skipped ? result.reason : result.message || '编辑已完成。';
  }

  for (let turn = 0; turn < 8; turn++) {
    throwIfAborted(signal);
    const response = await chatCompletion(settings, current, { signal });
    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('模型没有返回有效内容。');

    if (!message.tool_calls?.length) {
      finalText = message.content || '';
      break;
    }

    current.push(message);

    for (const toolCall of message.tool_calls) {
      const name = toolCall.function?.name;
      const args = safeJson(toolCall.function?.arguments || '{}');
      if (!TOOLS.some((item) => item.function.name === name)) {
        throw new Error(`模型调用了不支持的工具：${name}`);
      }
      validateToolArguments(name, args);

      enrichArgsFromPrompt(name, args, userPrompt);

      const targetError = validateTargetFromPrompt(name, args, userContext);
      if (targetError) {
        current.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ skipped: true, reason: targetError }),
        });
        appendMessage('tool', `已跳过 ${name}：${targetError}`);
        continue;
      }

      if (name === 'inspect_canvas') {
        inspectCount++;
        if (inspectCount > 2) {
          current.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ skipped: true, reason: '本次请求已达到画布分析次数上限。' }),
          });
          continue;
        }
      }

      throwIfAborted(signal);
      const result = CONFIRM_TOOLS.has(name)
        ? await runConfirmedTool(name, args, bridge, appendMessage, signal)
        : await runSimpleTool(name, args, bridge, appendMessage, signal);
      current.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  if (!finalText) finalText = '已完成请求的工具操作。';
  return finalText;
}

async function runConfirmedTool(name, args, bridge, appendMessage, signal) {
  throwIfAborted(signal);
  appendMessage('tool', `正在预览 ${name} ${JSON.stringify(args)}`);
  const preview = await previewConfirmedTool(name, args, bridge, signal);
  throwIfAborted(signal);
  appendMessage('tool', preview.message || `正在预览 ${name}。`);

  const approvedPreview = await confirmTool(name, args, preview, bridge, appendMessage, signal);
  if (!approvedPreview) {
    return { skipped: true, reason: '用户在预览后取消了本次操作。' };
  }

  throwIfAborted(signal);
  args.nodeIds = approvedPreview.nodeIds || [];
  return runSimpleTool(name, args, bridge, appendMessage, signal);
}

async function previewConfirmedTool(name, args, bridge, signal) {
  const preview = await bridge.call('preview_batch_edit', { toolName: name, toolArgs: args }, { signal });
  throwIfAborted(signal);
  if (preview.fontIssues?.length) {
    preview.availableFonts = await bridge.call('list_available_fonts', {}, { signal });
  }
  return preview;
}

async function runSimpleTool(name, args, bridge, appendMessage, signal) {
  throwIfAborted(signal);
  appendMessage('tool', `正在执行 ${name} ${JSON.stringify(args)}`);
  const result = await bridge.call(name, args, { signal });
  throwIfAborted(signal);
  appendMessage('tool', result.message || `${name} 已完成。`);
  return result;
}

function confirmTool(name, args, preview, bridge, appendMessage, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    let currentPreview = preview;
    let deepSearchUsed = Boolean(args.deepSearch);
    const panel = document.createElement('div');
    panel.className = 'edit-confirm';
    panel.innerHTML = confirmationMarkup(name, args, currentPreview, { deepSearchUsed });

    const controls = () => ({
      confirmButton: panel.querySelector('[data-confirm]'),
      cancelButton: panel.querySelector('[data-cancel]'),
      deepSearchButton: panel.querySelector('[data-deep-search]'),
    });
    const finish = (approved) => {
      signal?.removeEventListener('abort', abort);
      if (approved) applyFallbackFontChoice(panel, args);
      panel.remove();
      resolve(approved ? currentPreview : null);
    };
    const abort = () => finish(false);

    const bindActions = () => {
      const { confirmButton, cancelButton, deepSearchButton } = controls();
      confirmButton.addEventListener('click', () => finish(true));
      cancelButton.addEventListener('click', () => finish(false));
      deepSearchButton?.addEventListener('click', async () => {
        deepSearchButton.disabled = true;
        deepSearchButton.textContent = '检索中...';
        try {
          const nextArgs = deepSearchArgs(args);
          const nextPreview = await previewConfirmedTool(name, nextArgs, bridge, signal);
          currentPreview = nextPreview;
          Object.assign(args, nextArgs);
          deepSearchUsed = true;
          appendMessage(
            'tool',
            nextPreview.message || `深度检索预览到 ${nextPreview.targetCount || 0} 个图层。`,
          );
          panel.innerHTML = confirmationMarkup(name, args, currentPreview, { deepSearchUsed });
          bindActions();
          controls().confirmButton.focus();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendMessage('tool', `深度检索失败：${message}`);
          panel.innerHTML = confirmationMarkup(name, args, currentPreview, {
            deepSearchUsed,
            error: message,
          });
          bindActions();
          controls().deepSearchButton?.focus();
        }
      });
    };

    bindActions();
    panel.addEventListener('click', (event) => {
      if (event.target === panel) finish(false);
    });
    signal?.addEventListener('abort', abort, { once: true });

    document.body.appendChild(panel);
    controls().confirmButton.focus();
  });
}

function confirmationMarkup(name, args, preview, state = {}) {
  const scope = escapeHtml(preview.scope || args.scope || 'auto');
  const target = escapeHtml(preview.targetQuery || args.target || '所有匹配图层');
  const count = Number(preview.targetCount || preview.nodes?.length || 0);
  const nodes = Array.isArray(preview.nodes) ? preview.nodes : [];
  const fontPicker = fontPickerMarkup(preview);
  const deepSearchNote = state.deepSearchUsed
    ? '<p class="edit-confirm-note">已启用深度检索，并已重新选中最新匹配图层。</p>'
    : '<p class="edit-confirm-note">深度检索会保留当前范围并提高扫描上限，请在预览偏少时使用。</p>';
  const error = state.error ? `<p class="edit-confirm-error">${escapeHtml(state.error)}</p>` : '';
  const list = nodes.length
    ? nodes
        .map(
          (node) =>
            `<li><span>${escapeHtml(node.name || '(未命名)')}</span><em>${escapeHtml(node.type || '')}</em></li>`,
        )
        .join('')
    : '<li><span>暂无图层详情</span><em></em></li>';

  return [
    '<section class="edit-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="editConfirmTitle">',
    `<h2 id="editConfirmTitle">确认执行 ${escapeHtml(name)}</h2>`,
    '<div class="edit-confirm-meta">',
    `<span>范围：${scope}</span>`,
    `<span>目标：${target}</span>`,
    `<span>图层数：${count}</span>`,
    '</div>',
    '<p>这些图层已在 Figma 中自动选中。请检查画布后确认是否应用修改；应用后可在 Figma 中撤销本次操作。</p>',
    deepSearchNote,
    error,
    fontPicker,
    `<ul class="edit-confirm-list">${list}</ul>`,
    '<div class="edit-confirm-actions">',
    `<button type="button" class="secondary" data-deep-search ${state.deepSearchUsed ? 'disabled' : ''}>深度检索</button>`,
    '<button type="button" class="secondary" data-cancel>取消</button>',
    '<button type="button" class="primary" data-confirm>应用修改</button>',
    '</div>',
    '</section>',
  ].join('');
}

function deepSearchArgs(args) {
  const next = { ...args, deepSearch: true };
  delete next.nodeIds;
  return next;
}

function fontPickerMarkup(preview) {
  const issues = Array.isArray(preview.fontIssues) ? preview.fontIssues : [];
  if (!issues.length) return '';

  const fonts = Array.isArray(preview.availableFonts) ? preview.availableFonts : [];
  const options = fonts.length
    ? fonts
        .map((font) => {
          const family = escapeHtml(font.family);
          const style = escapeHtml(font.style);
          const value = escapeHtml(encodeFontValue(font));
          return `<option value="${value}">${family} ${style}</option>`;
        })
        .join('')
    : '<option value="">没有找到可用字体</option>';

  return [
    '<div class="font-fallback">',
    `<strong>${issues.length} 个文本图层使用了当前不可用的字体。</strong>`,
    '<label>改用已有字体',
    `<select data-font-fallback ${fonts.length ? '' : 'disabled'}>${options}</select>`,
    '</label>',
    '</div>',
  ].join('');
}

function applyFallbackFontChoice(panel, args) {
  const select = panel.querySelector('[data-font-fallback]');
  if (!select || !select.value) return;

  const font = decodeFontValue(select.value);
  if (font?.family && font?.style) args.fallbackFont = font;
}

function safeJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new ValidationError('模型返回了无效的工具参数 JSON。');
  }
}

function latestUserPrompt(messages) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || '';
}

function recentUserContext(messages) {
  return messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join('\n');
}

function validateTargetFromPrompt(name, args, userContext) {
  if (!CONFIRM_TOOLS.has(name) || !args.target) return '';

  const prompt = normalizeTarget(userContext);
  const target = normalizeTarget(args.target);
  if (!target || prompt.includes(target) || targetTokensAllowed(prompt, target)) return '';

  return `目标“${args.target}”没有出现在用户请求中，请先澄清，不要猜测其他目标。`;
}

function targetTokensAllowed(prompt, target) {
  const parts = target.split(/\s+/).filter(Boolean);
  if (!parts.length) return true;
  return parts.every((part) => prompt.includes(part));
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('操作已停止。');
  error.name = 'AbortError';
  throw error;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeFontValue(font) {
  return btoa(
    unescape(
      encodeURIComponent(
        JSON.stringify({
          family: font.family,
          style: font.style,
        }),
      ),
    ),
  );
}

function decodeFontValue(value) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
}
