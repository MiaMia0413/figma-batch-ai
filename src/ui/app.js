import { ERROR_CODES } from '../shared/errors.js';
import { createFigmaBridge } from './figma-bridge.js';
import { createSettingsPanel } from './settings-panel.js';
import { SYSTEM_PROMPT } from './tools.js';
import { runToolLoop } from './tool-loop.js';

const state = {
  settings: null,
  busy: false,
  messages: [],
  abortController: null,
  runId: 0,
};

const bridge = createFigmaBridge();
const messagesEl = $('messages');
const promptEl = $('prompt');
const runToggleButton = $('runToggleButton');
const clearButton = $('clearButton');
const quickActionsToggle = $('quickActionsToggle');
const quickActionsList = $('quickActionsList');
const statusEl = $('status');
const settingsPanel = createSettingsPanel({ bridge, state, setStatus });

runToggleButton.onclick = () => {
  if (state.busy) stopCurrentRun();
  else runPrompt(promptEl.value);
};
clearButton.onclick = clearConversation;
quickActionsToggle.onclick = toggleQuickActions;

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    promptEl.value = button.getAttribute('data-prompt');
    setQuickActionsOpen(false);
    promptEl.focus();
  });
});

promptEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    runPrompt(promptEl.value);
  }
});

init();

async function init() {
  try {
    state.settings = await bridge.call('get_settings');
    renderWelcome();
    if (!state.settings.apiKey) settingsPanel.open();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderWelcome() {
  appendMessage(
    'assistant',
    [
      '你可以直接描述想修改的设计稿内容，不必先选中图层。选中图层只会作为缩小范围的辅助方式。',
      '',
      '示例：',
      '- 将所有主按钮背景色改成 #4BC430',
      '- 把所有兑换按钮文案改成“去使用”',
      '- 将选中的卡片圆角改成 12px',
      '- 检查当前设计稿中的设计一致性问题',
    ].join('\n'),
  );
}

async function runPrompt(rawPrompt) {
  const userPrompt = rawPrompt.trim();
  if (!userPrompt || state.busy) return;
  if (!state.settings?.apiKey) {
    settingsPanel.open();
    setStatus('请先填写 API Key，再运行 AI 指令。', true);
    return;
  }

  const conversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...state.messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-10)
      .map(({ role, content }) => ({ role, content })),
    { role: 'user', content: userPrompt },
  ];

  const runId = state.runId + 1;
  const abortController = new AbortController();
  state.runId = runId;
  state.abortController = abortController;

  setBusy(true);
  setStatus('正在思考...');
  promptEl.value = '';
  appendMessage('user', userPrompt);

  try {
    const finalText = await runToolLoop({
      settings: state.settings,
      messages: conversation,
      bridge,
      appendMessage,
      signal: abortController.signal,
    });
    if (runId !== state.runId || abortController.signal.aborted) return;
    appendMessage('assistant', finalText || '已完成。');
    setStatus('就绪。');
  } catch (error) {
    if (runId !== state.runId) return;
    if (isAbortError(error)) {
      appendMessage('assistant', '已停止当前对话。');
      setStatus('已停止。');
    } else {
      appendMessage('assistant', `出错：${error.message}`);
      setStatus(error.message, true);
    }
  } finally {
    if (runId === state.runId) {
      state.abortController = null;
      setBusy(false);
    }
  }
}

function appendMessage(role, content) {
  state.messages.push({ role, content });
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = content;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBusy(busy) {
  state.busy = busy;
  runToggleButton.textContent = busy ? '停止' : '运行';
  runToggleButton.classList.toggle('danger', busy);
  runToggleButton.setAttribute('aria-label', busy ? '停止当前对话' : '运行指令');
  promptEl.disabled = busy;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', Boolean(isError));
}

function stopCurrentRun() {
  if (!state.busy || !state.abortController) return;
  state.abortController.abort();
  setStatus('正在停止...');
}

function clearConversation() {
  if (state.busy) stopCurrentRun();
  state.runId++;
  state.abortController = null;
  setBusy(false);
  state.messages = [];
  messagesEl.innerHTML = '';
  renderWelcome();
  setStatus('对话已清空。');
}

function toggleQuickActions() {
  setQuickActionsOpen(quickActionsList.hidden);
}

function setQuickActionsOpen(open) {
  quickActionsList.hidden = !open;
  quickActionsToggle.setAttribute('aria-expanded', String(open));
  quickActionsToggle.setAttribute('aria-label', open ? '收起快捷指令' : '展开快捷指令');
  quickActionsToggle.classList.toggle('open', open);
  quickActionsToggle.closest('.composer')?.classList.toggle('quick-actions-open', open);
}

function isAbortError(error) {
  return (
    error?.code === ERROR_CODES.CANCELLED ||
    error?.name === 'AbortError' ||
    /aborted|abort|停止/.test(String(error?.message || ''))
  );
}

function $(id) {
  return document.getElementById(id);
}
