import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateShortcut, worstSeverity } from '../utils/reserved';
import { selectTab } from '../utils/session';
import {
  DEFAULT_SHORTCUTS,
  eventMatchesShortcut,
  formatShortcut,
  isShortcutRelease,
  parseShortcut,
  shortcutFromEvent,
} from '../utils/shortcuts';

function keyEvent(partial: Partial<KeyboardEvent> & { code: string; key: string }): KeyboardEvent {
  return {
    repeat: false,
    isComposing: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...partial,
  } as KeyboardEvent;
}

describe('selectTab', () => {
  const tabs = [
    { id: 1, active: false },
    { id: 2, active: true },
    { id: 3, active: false },
  ];

  it('selects the next tab from the active one', () => {
    assert.deepEqual(selectTab(tabs, 'next'), {
      currentTabId: 2,
      selectedTabId: 3,
    });
  });

  it('selects the previous tab from the active one', () => {
    assert.deepEqual(selectTab(tabs, 'prev'), {
      currentTabId: 2,
      selectedTabId: 1,
    });
  });

  it('wraps forward from the last tab', () => {
    assert.deepEqual(selectTab(tabs, 'next', 3), {
      currentTabId: 2,
      selectedTabId: 1,
    });
  });

  it('keeps the current tab marked while cycling', () => {
    const first = selectTab(tabs, 'next');
    const second = selectTab(tabs, 'next', first?.selectedTabId);
    assert.equal(second?.currentTabId, 2);
    assert.equal(second?.selectedTabId, 1);
  });

  it('returns null when there are no tabs', () => {
    assert.equal(selectTab([], 'next'), null);
  });
});

describe('shortcuts', () => {
  it('parses the default forward shortcut', () => {
    assert.deepEqual(parseShortcut(DEFAULT_SHORTCUTS.next), {
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      macCtrl: false,
      key: 'Q',
    });
  });

  it('matches Ctrl+Q from a keyboard event', () => {
    const event = keyEvent({ code: 'KeyQ', key: 'q', ctrlKey: true });
    assert.equal(eventMatchesShortcut(event, 'Ctrl+Q'), true);
    assert.equal(eventMatchesShortcut(event, 'Ctrl+Shift+Q'), false);
  });

  it('records a shortcut from a keyboard event', () => {
    const event = keyEvent({ code: 'KeyQ', key: 'q', ctrlKey: true, shiftKey: true });
    assert.equal(shortcutFromEvent(event), 'Ctrl+Shift+Q');
  });

  it('formats shortcuts for display', () => {
    assert.match(formatShortcut('Ctrl+Q'), /Q/);
  });

  it('commits when the shortcut modifier is released', () => {
    assert.equal(isShortcutRelease(keyEvent({ code: 'ControlLeft', key: 'Control' })), true);
    assert.equal(isShortcutRelease(keyEvent({ code: 'KeyQ', key: 'q', ctrlKey: true })), false);
    assert.equal(isShortcutRelease(keyEvent({ code: 'KeyQ', key: 'q' })), true);
  });
});

describe('reserved shortcuts', () => {
  it('blocks browser tab shortcuts', () => {
    const issues = evaluateShortcut('Ctrl+T');
    assert.equal(worstSeverity(issues), 'blocked');
    assert.match(issues[0]?.message ?? '', /new tab/i);
  });

  it('warns about the default quit-adjacent shortcuts', () => {
    assert.equal(worstSeverity(evaluateShortcut('Ctrl+Q')), 'warning');
    assert.equal(worstSeverity(evaluateShortcut('Ctrl+Shift+Q')), 'warning');
  });

  it('rejects the same shortcut for both directions', () => {
    const issues = evaluateShortcut('Alt+S', 'Alt+S');
    assert.equal(worstSeverity(issues), 'blocked');
    assert.match(issues.map((issue) => issue.message).join(' '), /same shortcut/);
  });
});
