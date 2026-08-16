import type { ShortcutSettings } from './types';

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  next: 'Ctrl+Q',
  prev: 'Ctrl+Shift+Q',
};

export const COMMAND_NEXT = 'next-tab';
export const COMMAND_PREV = 'prev-tab';

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Comma: 'Comma',
  Period: 'Period',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
};

const VALID_NAMED_KEYS = new Set([
  'Space',
  'Comma',
  'Period',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
  'Up',
  'Down',
  'Left',
  'Right',
]);

export interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  macCtrl: boolean;
  key: string;
}

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  if (!shortcut.trim()) return null;

  const parts = shortcut.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const parsed: ParsedShortcut = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    macCtrl: false,
    key: '',
  };

  for (const part of parts) {
    const token = part.toLowerCase();
    if (token === 'ctrl' || token === 'control') parsed.ctrl = true;
    else if (token === 'macctrl') {
      parsed.macCtrl = true;
      parsed.ctrl = true;
    } else if (token === 'alt' || token === 'option') parsed.alt = true;
    else if (token === 'shift') parsed.shift = true;
    else if (token === 'command' || token === 'cmd' || token === 'meta') {
      parsed.meta = true;
    } else if (parsed.key) {
      return null;
    } else {
      parsed.key = normalizeKeyName(part);
    }
  }

  if (!parsed.key) return null;
  return parsed;
}

export function normalizeKeyName(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return NAMED_KEYS[key] ?? key;
}

export function keyFromEvent(event: KeyboardEvent): string | null {
  if (event.code.startsWith('Key') && event.code.length === 4) {
    return event.code.slice(3);
  }
  if (event.code.startsWith('Digit') && event.code.length === 6) {
    return event.code.slice(5);
  }
  if (NAMED_KEYS[event.code]) return NAMED_KEYS[event.code];
  if (NAMED_KEYS[event.key]) return NAMED_KEYS[event.key];
  if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
    return event.key.toUpperCase();
  }
  return null;
}

export function shortcutFromEvent(event: KeyboardEvent): string | null {
  if (event.repeat || event.isComposing) return null;

  const key = keyFromEvent(event);
  if (!key) return null;

  const parts: string[] = [];
  if (event.metaKey && isMacPlatform()) parts.push('Command');
  if (event.ctrlKey) parts.push(isMacPlatform() ? 'MacCtrl' : 'Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function eventMatchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
): boolean {
  if (event.repeat || event.isComposing) return false;

  const parsed = parseShortcut(shortcut);
  const key = keyFromEvent(event);
  if (!parsed || !key) return false;
  if (key !== parsed.key) return false;

  const wantCtrl = parsed.ctrl || parsed.macCtrl;
  if (Boolean(event.ctrlKey) !== wantCtrl) return false;
  if (Boolean(event.altKey) !== parsed.alt) return false;
  if (Boolean(event.shiftKey) !== parsed.shift) return false;
  if (Boolean(event.metaKey) !== parsed.meta) return false;
  return true;
}

export function isModifierOnly(event: KeyboardEvent): boolean {
  return ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key);
}

export function isShortcutRelease(event: KeyboardEvent): boolean {
  const releasedPrimaryModifier =
    event.key === 'Control' ||
    event.key === 'Meta' ||
    event.key === 'Alt';
  return releasedPrimaryModifier || (!event.ctrlKey && !event.metaKey && !event.altKey);
}

export function formatShortcut(shortcut: string): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return shortcut || 'Not set';

  const parts: string[] = [];
  if (parsed.meta) parts.push(isMacPlatform() ? '⌘' : 'Cmd');
  if (parsed.macCtrl || parsed.ctrl) parts.push(isMacPlatform() ? '⌃' : 'Ctrl');
  if (parsed.alt) parts.push(isMacPlatform() ? '⌥' : 'Alt');
  if (parsed.shift) parts.push(isMacPlatform() ? '⇧' : 'Shift');
  parts.push(displayKey(parsed.key));
  return parts.join(' + ');
}

function displayKey(key: string): string {
  if (key === 'Space') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function isValidCommandKey(key: string): boolean {
  if (/^[A-Z0-9]$/.test(key)) return true;
  return VALID_NAMED_KEYS.has(key);
}

export function toCommandsApiShortcut(shortcut: string): string | null {
  const parsed = parseShortcut(shortcut);
  if (!parsed || !isValidCommandKey(parsed.key)) return null;

  const parts: string[] = [];
  if (parsed.meta) parts.push('Command');
  if (parsed.macCtrl) parts.push('MacCtrl');
  else if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(parsed.key);
  return parts.join('+');
}

export function shortcutsEqual(a: string, b: string): boolean {
  const left = parseShortcut(a);
  const right = parseShortcut(b);
  if (!left || !right) return a === b;
  return (
    left.key === right.key &&
    left.ctrl === right.ctrl &&
    left.alt === right.alt &&
    left.shift === right.shift &&
    left.meta === right.meta &&
    left.macCtrl === right.macCtrl
  );
}
