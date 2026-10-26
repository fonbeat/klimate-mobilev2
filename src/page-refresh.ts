/** Poll a bounded window, not every page the user has ever loaded. */
export function refreshOffsets(visible: readonly number[], loaded: number, pageSize: number) {
  const pages = visible.filter((index) => index >= 0 && index < loaded).map((index) => Math.floor(index / pageSize) * pageSize);
  return [...new Set([0, ...pages.slice(0, 1), ...pages.slice(-1)])];
}

export function itemKey(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return;
  const row = item as Record<string, unknown>;
  const key = row.ID ?? row.id;
  return typeof key === 'string' ? key : undefined;
}

/** Offset pagination cannot safely merge pages after insertion/removal/reordering. */
export function mergeRefreshedPage<T>(cached: T[], incoming: T[], offset: number, total: number, previousTotal: number, pageSize: number): T[] | null {
  if (cached.length <= pageSize && offset === 0) return incoming;
  if (total !== previousTotal || incoming.length !== cached.slice(offset, offset + pageSize).length) return null;
  if (incoming.some((row, index) => !itemKey(row) || itemKey(row) !== itemKey(cached[offset + index]))) return null;
  const next = [...cached];
  next.splice(offset, incoming.length, ...incoming);
  return next;
}
