export type MainTab = 'overview' | 'status' | 'incidents' | 'more';

const tabs: MainTab[] = ['overview', 'status', 'incidents', 'more'];

export function adjacentTab(current: MainTab, swipe: 'left' | 'right'): MainTab | null {
  return tabs[tabs.indexOf(current) + (swipe === 'left' ? 1 : -1)] ?? null;
}

export function tabForSwipe(current: MainTab, dx: number, dy: number): MainTab | null {
  if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return adjacentTab(current, dx < 0 ? 'left' : 'right');
}
