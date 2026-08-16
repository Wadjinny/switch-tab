import type { SwitchDirection, TabInfo } from './types';

export function selectTab(
  tabs: Pick<TabInfo, 'id' | 'active'>[],
  direction: SwitchDirection,
  selectedTabId?: number,
): { currentTabId: number; selectedTabId: number } | null {
  if (tabs.length === 0) return null;

  const current = tabs.find((tab) => tab.active) ?? tabs[0];
  const startId = selectedTabId ?? current.id;
  const startIndex = Math.max(0, tabs.findIndex((tab) => tab.id === startId));
  const nextIndex = (startIndex + (direction === 'next' ? 1 : -1) + tabs.length) % tabs.length;

  return {
    currentTabId: current.id,
    selectedTabId: tabs[nextIndex].id,
  };
}
