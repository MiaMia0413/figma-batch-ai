export function createSettingsPanel({ bridge, state, setStatus }) {
  const settingsEl = $('settings');
  const settingsStatusEl = $('settingsStatus');

  $('settingsButton').onclick = open;
  $('closeSettings').onclick = close;
  $('settingsForm').onsubmit = save;
  $('settingsForm').addEventListener('click', applyShortcut);

  function open() {
    if (state.settings) {
      $('apiKey').value = state.settings.apiKey || '';
      $('endpoint').value = state.settings.endpoint || 'https://api.openai.com/v1';
      $('model').value = state.settings.model || 'gpt-4o-mini';
    }
    settingsStatusEl.textContent = '';
    settingsStatusEl.classList.remove('error');
    settingsEl.classList.add('open');
  }

  function close() {
    settingsEl.classList.remove('open');
  }

  async function save(event) {
    event.preventDefault();
    settingsStatusEl.textContent = '正在保存...';
    settingsStatusEl.classList.remove('error');
    try {
      const next = {
        apiKey: $('apiKey').value,
        endpoint: $('endpoint').value,
        model: $('model').value,
      };
      await bridge.call('save_settings', next);
      state.settings = next;
      settingsStatusEl.textContent = '已保存。';
      close();
      setStatus('设置已保存。');
    } catch (error) {
      settingsStatusEl.textContent = error.message;
      settingsStatusEl.classList.add('error');
    }
  }

  function applyShortcut(event) {
    const button = event.target.closest('[data-target][data-value]');
    if (!button) return;

    const input = $(button.dataset.target);
    if (!input) return;

    input.value = button.dataset.value;
    input.focus();
  }

  return { open, close };
}

function $(id) {
  return document.getElementById(id);
}
