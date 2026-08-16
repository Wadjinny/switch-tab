import overlayCss from './style.css?inline';
import {
  eventMatchesShortcut,
  isModifierOnly,
  isShortcutRelease,
  parseShortcut,
} from '../../utils/shortcuts';
import { getShortcuts, onShortcutsChanged } from '../../utils/storage';
import type {
  Message,
  MessageResponse,
  ShortcutSettings,
  SwitchSession,
  TabInfo,
} from '../../utils/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,

  async main(ctx) {
    const isTop = window === window.top;
    let shortcuts = {
      next: 'Ctrl+Q',
      prev: 'Ctrl+Shift+Q',
    };
    void getShortcuts().then((next) => {
      shortcuts = next;
    });
    onShortcutsChanged((next) => {
      shortcuts = next;
    });

    let host: HTMLElement | null = null;
    let root: OverlayRoot | null = null;
    let session: SwitchSession | null = null;
    let pendingCommit = false;
    let cycleInFlight = false;

    ctx.addEventListener(window, 'keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      void onKeyDown(event);
    }, { capture: true });

    ctx.addEventListener(window, 'keyup', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      void onKeyUp(event);
    }, { capture: true });

    if (isTop) {
      ctx.addEventListener(document, 'visibilitychange', () => {
        if (document.hidden) hideOverlay();
      });

      browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'hide-overlay') {
          hideOverlay();
          sendResponse({ ok: true, session: null });
          return;
        }
        if (message?.type !== 'render-session') return;
        session = message.session as SwitchSession;
        void showOverlay(session)
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
        return true;
      });
    }

    async function onKeyDown(event: KeyboardEvent) {
      if (isModifierOnly(event)) return;

      if (event.key === 'Escape' && session) {
        event.preventDefault();
        event.stopPropagation();
        await send({ type: 'cancel' });
        hideOverlay();
        return;
      }

      if (event.key === 'Enter' && session) {
        event.preventDefault();
        event.stopPropagation();
        await send({ type: 'commit' });
        hideOverlay();
        return;
      }

      const direction = matchDirection(event, shortcuts);
      if (!direction) return;

      event.preventDefault();
      event.stopPropagation();
      cycleInFlight = true;

      const response = await send({ type: 'cycle', direction });
      cycleInFlight = false;
      if (response.ok && 'session' in response) session = response.session;
      if (pendingCommit) await commitSession();
    }

    async function onKeyUp(event: KeyboardEvent) {
      if (!isShortcutRelease(event)) return;
      if (!session && !cycleInFlight) return;
      await commitSession();
    }

    async function commitSession() {
      if (!session) {
        pendingCommit = true;
        return;
      }
      pendingCommit = false;
      cycleInFlight = false;
      await send({ type: 'commit' });
      hideOverlay();
    }

    async function showOverlay(next: SwitchSession) {
      if (!isTop) return;
      ensureUi();
      root?.render(next, shortcuts);
    }

    function hideOverlay() {
      session = null;
      pendingCommit = false;
      cycleInFlight = false;
      root?.hide();
    }

    function ensureUi() {
      if (root && host?.isConnected) return;
      const target = document.documentElement;
      if (!target) throw new Error('No document to mount the overlay');

      host = document.createElement('switch-tab-overlay');
      host.setAttribute('data-switch-tab', 'overlay');
      host.style.cssText = [
        'position:fixed',
        'inset:0',
        'width:100vw',
        'height:100vh',
        'z-index:2147483646',
        'pointer-events:auto',
      ].join(';');

      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = overlayCss;
      const container = document.createElement('div');
      shadow.append(style, container);
      target.append(host);

      root = createOverlayRoot(container, async (tabId) => {
        await send({ type: 'activate', tabId });
        hideOverlay();
      }, () => {
        void send({ type: 'cancel' });
        hideOverlay();
      });
    }
  },
});

function matchDirection(
  event: KeyboardEvent,
  shortcuts: ShortcutSettings,
): 'next' | 'prev' | null {
  if (eventMatchesShortcut(event, shortcuts.next)) return 'next';
  if (eventMatchesShortcut(event, shortcuts.prev)) return 'prev';
  return null;
}

async function send(message: Message): Promise<MessageResponse> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return { ok: false, error: 'Extension context unavailable' };
  }
}

interface OverlayRoot {
  render: (session: SwitchSession, shortcuts: ShortcutSettings) => void;
  hide: () => void;
}

function createOverlayRoot(
  container: HTMLElement,
  onActivate: (tabId: number) => void,
  onCancel: () => void,
): OverlayRoot {
  const wrap = document.createElement('div');
  wrap.className = 'switch-tab';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="scrim"></div>
    <div class="panel" role="dialog" aria-label="Open tabs">
      <div class="header">
        <p class="title">Open tabs</p>
        <span class="count"></span>
      </div>
      <ul class="list" role="listbox"></ul>
      <div class="hint-row">
        <span>Release Ctrl to switch</span>
        <span>Esc cancels</span>
      </div>
    </div>
  `;
  container.append(wrap);

  const list = wrap.querySelector('.list') as HTMLUListElement;
  const count = wrap.querySelector('.count') as HTMLElement;
  const hint = wrap.querySelector('.hint-row span') as HTMLElement;
  const scrim = wrap.querySelector('.scrim') as HTMLElement;

  scrim.addEventListener('click', onCancel);

  return {
    render(session, shortcuts) {
      wrap.hidden = false;
      count.textContent = `${session.tabs.length} tabs`;
      hint.textContent = releaseHint(shortcuts);
      list.replaceChildren();

      for (const tab of session.tabs) {
        list.append(renderTab(tab, session, onActivate));
      }

      const selected = list.querySelector('.selected');
      selected?.scrollIntoView({ block: 'nearest' });
    },
    hide() {
      wrap.hidden = true;
    },
  };
}

function renderTab(
  tab: TabInfo,
  session: SwitchSession,
  onActivate: (tabId: number) => void,
): HTMLLIElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tab';
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(tab.id === session.selectedTabId));
  if (tab.id === session.selectedTabId) button.classList.add('selected');
  if (tab.id === session.currentTabId || tab.active) button.classList.add('current');

  button.append(createIcon(tab), createMeta(tab));

  if (tab.id === session.currentTabId || tab.active) {
    const mark = document.createElement('span');
    mark.className = 'current-mark';
    mark.textContent = 'Current';
    button.append(mark);
  }

  button.addEventListener('click', () => onActivate(tab.id));
  item.append(button);
  return item;
}

function createIcon(tab: TabInfo): HTMLElement {
  if (tab.favIconUrl) {
    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.alt = '';
    icon.referrerPolicy = 'no-referrer';
    icon.src = tab.favIconUrl;
    icon.addEventListener('error', () => {
      icon.replaceWith(fallbackIcon(tab.title));
    });
    return icon;
  }
  return fallbackIcon(tab.title);
}

function createMeta(tab: TabInfo): HTMLDivElement {
  const meta = document.createElement('div');
  meta.className = 'meta';

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = tab.title;

  const host = document.createElement('div');
  host.className = 'host';
  host.textContent = hostname(tab.url);

  meta.append(name);
  if (host.textContent) meta.append(host);
  return meta;
}

function fallbackIcon(title: string): HTMLDivElement {
  const icon = document.createElement('div');
  icon.className = 'favicon-fallback';
  icon.textContent = (title.trim().charAt(0) || '#').toUpperCase();
  return icon;
}

function hostname(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname.replace(/^www\./, '');
    }
    return parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}

function releaseHint(shortcuts: ShortcutSettings): string {
  const parsed = parseShortcut(shortcuts.next) ?? parseShortcut(shortcuts.prev);
  if (parsed?.meta) return 'Release ⌘ to switch';
  if (parsed?.alt && !parsed.ctrl) return 'Release Alt to switch';
  return 'Release Ctrl to switch';
}
