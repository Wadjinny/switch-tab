import { evaluateShortcut, worstSeverity } from '../../utils/reserved';
import {
  COMMAND_NEXT,
  COMMAND_PREV,
  DEFAULT_SHORTCUTS,
  formatShortcut,
  isModifierOnly,
  shortcutFromEvent,
  toCommandsApiShortcut,
} from '../../utils/shortcuts';
import { getShortcuts, setShortcuts } from '../../utils/storage';
import type { ShortcutSettings } from '../../utils/types';

const labels = {
  next: document.querySelector('[data-label="next"]') as HTMLElement,
  prev: document.querySelector('[data-label="prev"]') as HTMLElement,
};

const buttons = {
  next: document.querySelector('[data-record="next"]') as HTMLButtonElement,
  prev: document.querySelector('[data-record="prev"]') as HTMLButtonElement,
};

const statuses = {
  next: document.querySelector('[data-status="next"]') as HTMLElement,
  prev: document.querySelector('[data-status="prev"]') as HTMLElement,
};

const commandStatus = document.querySelector('[data-command-status]') as HTMLElement;
const resetButton = document.querySelector('[data-reset]') as HTMLButtonElement;
const browserShortcutsButton = document.querySelector('[data-browser-shortcuts]') as HTMLButtonElement;

let settings: ShortcutSettings = { ...DEFAULT_SHORTCUTS };
let recording: keyof ShortcutSettings | null = null;

async function init() {
  settings = await getShortcuts();
  render();
  await refreshCommandStatus();
}

function render() {
  for (const action of ['next', 'prev'] as const) {
    const other = action === 'next' ? settings.prev : settings.next;
    const issues = evaluateShortcut(settings[action], other);
    const severity = worstSeverity(issues);

    labels[action].textContent = recording === action
      ? 'Press keys…'
      : formatShortcut(settings[action]);

    buttons[action].classList.toggle('recording', recording === action);
    buttons[action].classList.toggle('warning', severity === 'warning');
    buttons[action].classList.toggle('blocked', severity === 'blocked');

    if (issues.length === 0) {
      statuses[action].hidden = true;
      statuses[action].textContent = '';
      statuses[action].className = 'status';
    } else {
      statuses[action].hidden = false;
      statuses[action].className = `status ${severity}`;
      statuses[action].textContent = issues.map((issue) => issue.message).join(' ');
    }
  }
}

async function save(next: ShortcutSettings) {
  settings = next;
  await setShortcuts(settings);
  await syncBrowserCommands(settings);
  render();
  await refreshCommandStatus();
}

async function syncBrowserCommands(next: ShortcutSettings) {
  const commands = browser.commands as typeof browser.commands & {
    update?: (detail: { name: string; shortcut?: string }) => Promise<void>;
  };
  if (!commands.update) return;

  const nextShortcut = toCommandsApiShortcut(next.next);
  const prevShortcut = toCommandsApiShortcut(next.prev);
  if (!nextShortcut || !prevShortcut) return;

  try {
    await commands.update({ name: COMMAND_NEXT, shortcut: nextShortcut });
    await commands.update({ name: COMMAND_PREV, shortcut: prevShortcut });
  } catch {
    // Chrome does not allow programmatic rebinding.
  }
}

async function refreshCommandStatus() {
  try {
    const commands = await browser.commands.getAll();
    const next = commands.find((command) => command.name === COMMAND_NEXT);
    const prev = commands.find((command) => command.name === COMMAND_PREV);
    const notes: string[] = [];

    if (next && !next.shortcut) {
      notes.push('Chrome did not accept the forward shortcut. It is likely reserved by the browser.');
    }
    if (prev && !prev.shortcut) {
      notes.push('Chrome did not accept the backward shortcut. It is likely reserved by the browser.');
    }
    if (!browser.commands || !('update' in browser.commands)) {
      notes.push('Chrome keeps a separate browser-level binding. Use “Browser shortcut settings” if a shortcut never fires on chrome:// pages.');
    }

    commandStatus.textContent = notes.join(' ');
  } catch {
    commandStatus.textContent = '';
  }
}

for (const action of ['next', 'prev'] as const) {
  buttons[action].addEventListener('click', () => {
    recording = action;
    render();
    buttons[action].focus();
  });
}

document.addEventListener('keydown', (event) => {
  if (!recording) return;
  if (event.key === 'Escape') {
    recording = null;
    render();
    return;
  }
  if (isModifierOnly(event)) return;

  event.preventDefault();
  const shortcut = shortcutFromEvent(event);
  if (!shortcut) return;

  const next = { ...settings, [recording]: shortcut };
  recording = null;
  void save(next);
});

document.addEventListener('click', (event) => {
  if (!recording) return;
  const target = event.target as HTMLElement;
  if (target.closest('[data-record]')) return;
  recording = null;
  render();
});

resetButton.addEventListener('click', () => {
  recording = null;
  void save({ ...DEFAULT_SHORTCUTS });
});

browserShortcutsButton.addEventListener('click', () => {
  const url = import.meta.env.FIREFOX
    ? 'about:addons'
    : 'chrome://extensions/shortcuts';
  void browser.tabs.create({ url });
});

void init();
