export type SwitchDirection = 'next' | 'prev';

export interface ShortcutSettings {
  next: string;
  prev: string;
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
}

export interface SwitchSession {
  windowId: number;
  currentTabId: number;
  selectedTabId: number;
  tabs: TabInfo[];
}

export type Message =
  | { type: 'cycle'; direction: SwitchDirection }
  | { type: 'commit' }
  | { type: 'cancel' }
  | { type: 'activate'; tabId: number }
  | { type: 'get-session' }
  | { type: 'get-shortcuts' }
  | { type: 'hide-overlay' }
  | { type: 'render-session'; session: SwitchSession };

export type MessageResponse =
  | { ok: true; session: SwitchSession | null }
  | { ok: true; shortcuts: ShortcutSettings }
  | { ok: false; error: string };

export type ShortcutSeverity = 'ok' | 'warning' | 'blocked';

export interface ShortcutIssue {
  severity: ShortcutSeverity;
  message: string;
}
