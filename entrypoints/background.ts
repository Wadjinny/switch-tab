import { selectTab } from '../utils/session';
import { COMMAND_NEXT, COMMAND_PREV } from '../utils/shortcuts';
import { getShortcuts } from '../utils/storage';
import type {
  Message,
  MessageResponse,
  SwitchDirection,
  SwitchSession,
  TabInfo,
} from '../utils/types';

export default defineBackground(() => {
  let session: SwitchSession | null = null;
  let lastTriggerAt = 0;

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === COMMAND_NEXT) void cycle('next');
    if (command === COMMAND_PREV) void cycle('prev');
  });

  browser.runtime.onMessage.addListener((
    message: Message,
    _sender,
    sendResponse,
  ) => {
    void handleMessage(message).then(sendResponse);
    return true;
  });

  async function handleMessage(message: Message): Promise<MessageResponse> {
    switch (message.type) {
      case 'cycle':
        await cycle(message.direction);
        return { ok: true, session };
      case 'commit':
        await dismiss();
        return { ok: true, session: null };
      case 'cancel':
        await dismiss();
        return { ok: true, session: null };
      case 'activate':
        await jumpTo(message.tabId);
        return { ok: true, session: null };
      case 'get-session':
        return { ok: true, session };
      case 'get-shortcuts':
        return { ok: true, shortcuts: await getShortcuts() };
      default:
        return { ok: false, error: 'Unknown message' };
    }
  }

  async function cycle(direction: SwitchDirection) {
    if (Date.now() - lastTriggerAt < 100) return;
    lastTriggerAt = Date.now();

    const windowId = await currentWindowId();
    if (windowId == null) return;
    if (session && session.windowId !== windowId) session = null;

    const tabs = await listTabs(windowId);
    if (tabs.length === 0) return;

    const picked = selectTab(tabs, direction, session?.selectedTabId);
    if (!picked) return;

    await browser.tabs.update(picked.selectedTabId, { active: true });
    const refreshed = await listTabs(windowId);

    session = {
      windowId,
      currentTabId: picked.selectedTabId,
      selectedTabId: picked.selectedTabId,
      tabs: refreshed,
    };

    await showOverlay(session);
  }

  async function dismiss() {
    const windowId = session?.windowId;
    session = null;
    if (windowId != null) await hideOverlays(windowId);
  }

  async function jumpTo(tabId: number) {
    const windowId = session?.windowId;
    session = null;
    try {
      await browser.tabs.update(tabId, { active: true });
    } catch {
      // Tab may have closed while the overlay was open.
    }
    if (windowId != null) await hideOverlays(windowId);
  }

  async function currentWindowId(): Promise<number | undefined> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.windowId ?? session?.windowId;
  }

  async function listTabs(windowId: number): Promise<TabInfo[]> {
    const tabs = await browser.tabs.query({ windowId });
    return tabs
      .filter((tab): tab is typeof tab & { id: number } => typeof tab.id === 'number')
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((tab) => ({
        id: tab.id,
        title: tab.title?.trim() || titleFromUrl(tab.url) || 'Untitled',
        url: tab.url ?? '',
        favIconUrl: usableFavIcon(tab.favIconUrl),
        active: Boolean(tab.active),
        pinned: Boolean(tab.pinned),
      }));
  }

  async function showOverlay(nextSession: SwitchSession): Promise<void> {
    await sendToTab(nextSession.selectedTabId, {
      type: 'render-session',
      session: nextSession,
    });
  }

  async function hideOverlays(windowId: number): Promise<void> {
    const tabs = await browser.tabs.query({ windowId });
    await Promise.all(tabs.map((tab) => {
      if (tab.id == null) return Promise.resolve();
      return sendToTab(tab.id, { type: 'hide-overlay' });
    }));
  }

  async function sendToTab(tabId: number, message: Message): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await browser.tabs.sendMessage(tabId, message);
        return;
      } catch {
        await delay(40);
      }
    }
  }
});

function titleFromUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function usableFavIcon(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
    return undefined;
  }
  return url;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
