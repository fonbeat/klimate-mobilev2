import { readUnreadInbox, type InboxRead } from './inbox-recovery.ts';
import type { NotificationInboxItem, NotificationInboxPage } from './types';

type Snapshot = { items: NotificationInboxItem[]; unread: number; fullAt: number };
const fingerprint = (items: NotificationInboxItem[]) => items.map((item) => `${item.id}:${item.read}`).join('|');

/** Always check the newest page. Reuse the verified tail briefly when unchanged;
 * merge new arrivals only when the unread-count delta proves no old reads were
 * removed. External reads, large head changes, manual refresh and expiry rescan. */
export class UnreadInboxCache {
  private snapshot?: Snapshot;
  private clock: () => number;
  private maxAge: number;
  constructor(clock = Date.now, maxAge = 120_000) { this.clock = clock; this.maxAge = maxAge; }
  async read(read: InboxRead, current: () => boolean, force = false) {
    const head = await read<NotificationInboxPage>('/v2/notifications?offset=0&limit=100&unreadOnly=true');
    if (!current()) return undefined;
    const previous = this.snapshot;
    let next: Snapshot | undefined;
    if (!force && previous && this.clock() - previous.fullAt < this.maxAge) {
      if (head.unread === previous.unread && fingerprint(head.records) === fingerprint(previous.items.slice(0, head.records.length))) next = { ...previous };
      else {
        const oldIds = new Set(previous.items.map((item) => item.id));
        const newItems = head.records.filter((item) => !oldIds.has(item.id));
        const anchor = head.records.findIndex((item) => item.id === previous.items[0]?.id);
        if (anchor >= 0 && newItems.length === anchor && head.unread - previous.unread === newItems.length && fingerprint(head.records.slice(anchor)) === fingerprint(previous.items.slice(0, head.records.length - anchor))) {
          next = { ...previous, unread: head.unread, items: [...newItems, ...previous.items] };
        }
      }
    }
    if (!next) {
      const page = await readUnreadInbox(read, current, head);
      if (!page) return undefined;
      // Never cache an incomplete scan as a complete unread snapshot.
      next = { ...page, fullAt: page.items.length >= page.unread ? this.clock() : -Infinity };
    }
    if (!current()) return undefined;
    this.snapshot = next;
    return { items: next.items, unread: next.unread };
  }
  recordRead(id?: string) {
    if (!this.snapshot) return;
    if (!id) { this.snapshot = { items: [], unread: 0, fullAt: this.clock() }; return; }
    const present = this.snapshot.items.some((item) => item.id === id && !item.read);
    this.snapshot = { ...this.snapshot, unread: Math.max(0, this.snapshot.unread - (present ? 1 : 0)), items: this.snapshot.items.filter((item) => item.id !== id) };
  }
}

/** Scope-owned, bounded caches coalesce page inspection and badge reconciliation.
 * Errors have a short backoff, never a fabricated healthy result. */
export class InboxHealthCache {
  private responses = new Map<string, { until: number; value: Promise<unknown> }>();
  private storage = new Map<string, Promise<string | null>>();
  private clock: () => number;
  constructor(clock = Date.now) { this.clock = clock; }
  read = <T>(path: string, read: InboxRead): Promise<T> => {
    const cached = this.responses.get(path);
    if (cached && cached.until > this.clock()) return cached.value as Promise<T>;
    const value = read<T>(path);
    const entry = { until: Infinity, value };
    this.responses.set(path, entry);
    void value.then(() => { entry.until = this.clock() + 30_000; }, () => { entry.until = this.clock() + 5000; });
    if (this.responses.size > 200) this.responses.delete(this.responses.keys().next().value!);
    return value;
  };
  load = (key: string, load: (key: string) => Promise<string | null>) => {
    let value = this.storage.get(key);
    if (!value) {
      value = load(key).catch(() => { this.storage.delete(key); return null; });
      this.storage.set(key, value);
      if (this.storage.size > 500) this.storage.delete(this.storage.keys().next().value!);
    }
    return value;
  };
  clear() { this.responses.clear(); }
}
