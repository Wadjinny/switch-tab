import { DEFAULT_SHORTCUTS } from './shortcuts';
import type { ShortcutSettings } from './types';

const STORAGE_KEY = 'shortcuts';

export async function getShortcuts(): Promise<ShortcutSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<ShortcutSettings> | undefined;
  return {
    next: value?.next || DEFAULT_SHORTCUTS.next,
    prev: value?.prev || DEFAULT_SHORTCUTS.prev,
  };
}

export async function setShortcuts(shortcuts: ShortcutSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: shortcuts });
}

export function onShortcutsChanged(
  listener: (shortcuts: ShortcutSettings) => void,
): () => void {
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue as Partial<ShortcutSettings> | undefined;
    listener({
      next: next?.next || DEFAULT_SHORTCUTS.next,
      prev: next?.prev || DEFAULT_SHORTCUTS.prev,
    });
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
