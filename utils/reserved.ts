import type { ShortcutIssue } from './types';
import {
  isMacPlatform,
  isValidCommandKey,
  parseShortcut,
  shortcutsEqual,
} from './shortcuts';

interface ReservedEntry {
  shortcut: string;
  platforms?: Array<'windows' | 'mac' | 'linux'>;
  severity: 'blocked' | 'warning';
  message: string;
}

const RESERVED: ReservedEntry[] = [
  { shortcut: 'Ctrl+N', severity: 'blocked', message: 'Opens a new window.' },
  { shortcut: 'Ctrl+Shift+N', severity: 'blocked', message: 'Opens an incognito / private window in Chromium.' },
  { shortcut: 'Ctrl+T', severity: 'blocked', message: 'Opens a new tab.' },
  { shortcut: 'Ctrl+Shift+T', severity: 'blocked', message: 'Reopens the last closed tab.' },
  { shortcut: 'Ctrl+W', severity: 'blocked', message: 'Closes the current tab.' },
  { shortcut: 'Ctrl+Shift+W', severity: 'blocked', message: 'Closes the current window.' },
  { shortcut: 'Ctrl+Tab', severity: 'blocked', message: 'The browser already uses this to cycle tabs.' },
  { shortcut: 'Ctrl+Shift+Tab', severity: 'blocked', message: 'The browser already uses this to cycle tabs backward.' },
  { shortcut: 'Ctrl+PageDown', severity: 'blocked', message: 'The browser already uses this to go to the next tab.' },
  { shortcut: 'Ctrl+PageUp', severity: 'blocked', message: 'The browser already uses this to go to the previous tab.' },
  { shortcut: 'Ctrl+L', severity: 'blocked', message: 'Focuses the address bar.' },
  { shortcut: 'Alt+D', severity: 'blocked', message: 'Focuses the address bar.' },
  { shortcut: 'Ctrl+K', severity: 'blocked', message: 'Focuses the browser search / address bar.' },
  { shortcut: 'Ctrl+E', severity: 'blocked', message: 'Focuses the browser search / address bar.' },
  { shortcut: 'Ctrl+F', severity: 'blocked', message: 'Opens find-in-page.' },
  { shortcut: 'Ctrl+G', severity: 'blocked', message: 'Finds the next match.' },
  { shortcut: 'Ctrl+Shift+G', severity: 'blocked', message: 'Finds the previous match.' },
  { shortcut: 'Ctrl+H', severity: 'blocked', message: 'Opens history.' },
  { shortcut: 'Ctrl+J', severity: 'blocked', message: 'Opens downloads.' },
  { shortcut: 'Ctrl+D', severity: 'blocked', message: 'Bookmarks the current page.' },
  { shortcut: 'Ctrl+Shift+B', severity: 'blocked', message: 'Toggles the bookmarks bar.' },
  { shortcut: 'Ctrl+Shift+O', severity: 'blocked', message: 'Opens the bookmark manager.' },
  { shortcut: 'Ctrl+P', severity: 'blocked', message: 'Opens print.' },
  { shortcut: 'Ctrl+S', severity: 'blocked', message: 'Saves the page.' },
  { shortcut: 'Ctrl+O', severity: 'blocked', message: 'Opens a file.' },
  { shortcut: 'Ctrl+R', severity: 'blocked', message: 'Reloads the page.' },
  { shortcut: 'Ctrl+Shift+R', severity: 'blocked', message: 'Hard-reloads the page.' },
  { shortcut: 'Ctrl+U', severity: 'blocked', message: 'Views page source.' },
  { shortcut: 'Ctrl+Shift+I', severity: 'blocked', message: 'Opens Developer Tools.' },
  { shortcut: 'Ctrl+Shift+J', severity: 'blocked', message: 'Opens the JavaScript console.' },
  { shortcut: 'Ctrl+Shift+C', severity: 'blocked', message: 'Opens inspect element.' },
  { shortcut: 'Ctrl+Shift+Delete', severity: 'blocked', message: 'Opens clear-browsing-data.' },
  { shortcut: 'Ctrl+Shift+M', severity: 'blocked', message: 'Toggles device mode in DevTools / profile menu.' },
  { shortcut: 'F1', severity: 'blocked', message: 'Opens browser help.' },
  { shortcut: 'F3', severity: 'blocked', message: 'Opens find-in-page.' },
  { shortcut: 'F5', severity: 'blocked', message: 'Reloads the page.' },
  { shortcut: 'F6', severity: 'blocked', message: 'Cycles focus in the browser chrome.' },
  { shortcut: 'F11', severity: 'blocked', message: 'Toggles fullscreen.' },
  { shortcut: 'F12', severity: 'blocked', message: 'Opens Developer Tools.' },
  { shortcut: 'Alt+F4', severity: 'blocked', message: 'Closes the window.', platforms: ['windows', 'linux'] },
  { shortcut: 'Alt+Left', severity: 'blocked', message: 'Goes back.', platforms: ['windows', 'linux'] },
  { shortcut: 'Alt+Right', severity: 'blocked', message: 'Goes forward.', platforms: ['windows', 'linux'] },
  { shortcut: 'Alt+Home', severity: 'blocked', message: 'Opens the homepage.', platforms: ['windows', 'linux'] },
  { shortcut: 'Alt+F', severity: 'blocked', message: 'Opens the browser menu.', platforms: ['windows'] },
  { shortcut: 'Alt+E', severity: 'blocked', message: 'Opens the browser menu.', platforms: ['windows'] },
  { shortcut: 'Alt+Tab', severity: 'blocked', message: 'Reserved by the operating system for app switching.' },
  { shortcut: 'Ctrl+Alt+Delete', severity: 'blocked', message: 'Reserved by the operating system.', platforms: ['windows'] },
  { shortcut: 'Ctrl+Shift+P', severity: 'blocked', message: 'Opens a private window in Firefox / print dialog in Chrome.' },
  { shortcut: 'Command+Q', severity: 'blocked', message: 'Quits the browser on macOS.', platforms: ['mac'] },
  { shortcut: 'Command+W', severity: 'blocked', message: 'Closes the current tab on macOS.', platforms: ['mac'] },
  { shortcut: 'Command+T', severity: 'blocked', message: 'Opens a new tab on macOS.', platforms: ['mac'] },
  { shortcut: 'Command+N', severity: 'blocked', message: 'Opens a new window on macOS.', platforms: ['mac'] },
  { shortcut: 'Command+Q', severity: 'blocked', message: 'Quits the browser.', platforms: ['mac'] },
  { shortcut: 'Command+Shift+Q', severity: 'blocked', message: 'Can quit or sign out of the browser on macOS.', platforms: ['mac'] },
  { shortcut: 'Ctrl+Q', severity: 'warning', message: 'Firefox on Linux uses this to quit. Chrome on Windows usually allows it.' },
  { shortcut: 'Ctrl+Shift+Q', severity: 'warning', message: 'Chrome and Firefox have used this to close or quit the browser.' },
  { shortcut: 'MacCtrl+Q', severity: 'warning', message: 'Works around Command+Q on macOS, but some apps still treat Control+Q as quit.' },
  { shortcut: 'MacCtrl+Shift+Q', severity: 'warning', message: 'Some browsers have used this combination to quit.' },
];

for (let index = 1; index <= 9; index += 1) {
  RESERVED.push({
    shortcut: `Ctrl+${index}`,
    severity: 'blocked',
    message: index === 9
      ? 'Jumps to the last tab.'
      : `Jumps to tab ${index}.`,
  });
  RESERVED.push({
    shortcut: `Command+${index}`,
    severity: 'blocked',
    message: index === 9
      ? 'Jumps to the last tab on macOS.'
      : `Jumps to tab ${index} on macOS.`,
    platforms: ['mac'],
  });
}

function currentPlatform(): 'windows' | 'mac' | 'linux' {
  if (isMacPlatform()) return 'mac';
  if (/Linux/i.test(navigator.userAgent)) return 'linux';
  return 'windows';
}

export function evaluateShortcut(
  shortcut: string,
  otherShortcut?: string,
): ShortcutIssue[] {
  const issues: ShortcutIssue[] = [];
  const parsed = parseShortcut(shortcut);
  const platform = currentPlatform();

  if (!shortcut.trim()) {
    issues.push({ severity: 'blocked', message: 'Choose a keyboard shortcut.' });
    return issues;
  }

  if (!parsed) {
    issues.push({
      severity: 'blocked',
      message: 'Could not read this shortcut. Use a modifier plus a letter or number.',
    });
    return issues;
  }

  if (!isValidCommandKey(parsed.key)) {
    issues.push({
      severity: 'blocked',
      message: 'Use a letter, number, or a navigation key such as Space or PageDown.',
    });
  }

  const hasNonShiftModifier = parsed.ctrl || parsed.alt || parsed.meta || parsed.macCtrl;
  if (!hasNonShiftModifier) {
    issues.push({
      severity: 'blocked',
      message: 'Add Ctrl, Alt, or Command. A bare key would steal normal typing.',
    });
  }

  if (otherShortcut && shortcutsEqual(shortcut, otherShortcut)) {
    issues.push({
      severity: 'blocked',
      message: 'Forward and backward cannot use the same shortcut.',
    });
  }

  for (const entry of RESERVED) {
    if (entry.platforms && !entry.platforms.includes(platform)) continue;
    if (!shortcutsEqual(shortcut, entry.shortcut)) continue;
    issues.push({ severity: entry.severity, message: entry.message });
  }

  return uniqueIssues(issues);
}

export function worstSeverity(issues: ShortcutIssue[]): ShortcutIssue['severity'] {
  if (issues.some((issue) => issue.severity === 'blocked')) return 'blocked';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  return 'ok';
}

function uniqueIssues(issues: ShortcutIssue[]): ShortcutIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
