import type { NotificationInboxItem, NotificationInboxPage } from './types';
import { monitorRecoveryEvidence, readStatusReport } from './status-report-reader.ts';

export type RecoveryLedger = Record<string, number>;
export type InboxRead = <T>(path: string) => Promise<T>;

export function recoveryKey(item: NotificationInboxItem) {
  if (!item.resourceId) return undefined;
  if (item.eventType === 'monitor_down' && item.resourceType === 'monitor') return `monitor:${item.resourceId}`;
  if (item.eventType === 'probe_offline' && item.resourceType === 'probe') return `probe:${item.resourceId}`;
  return undefined;
}

export function recoveryStorageKey(scope: string, resource: string) {
  return `klimate.inbox.recovery.v1.${`${scope}|${resource}`.split('').map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`;
}

export function isRecovered(item: NotificationInboxItem, ledger: RecoveryLedger) {
  const key = recoveryKey(item);
  const created = Date.parse(item.createdAt);
  return !!key && Number.isFinite(created) && created < (ledger[key] ?? 0);
}

export function outstandingUnread(serverUnread: number, items: NotificationInboxItem[], ledger: RecoveryLedger) {
  const recovered = new Set(items.filter((item) => !item.read && isRecovered(item, ledger)).map((item) => item.id));
  return Math.max(0, serverUnread - recovered.size);
}

export function inboxItems(items: NotificationInboxItem[], unreadOnly: boolean, recovered: (item: NotificationInboxItem) => boolean) {
  return unreadOnly ? items.filter((item) => !item.read && !recovered(item)) : items;
}

export function unreadInboxPath(offset: number) {
  return `/v2/notifications?offset=${offset}&limit=100&unreadOnly=true`;
}

export async function readUnreadInbox(read: InboxRead, current: () => boolean, head?: NotificationInboxPage, budget = Infinity, resume?: { items: NotificationInboxItem[]; offset: number }) {
  const items = new Map(resume?.items.map((item) => [item.id, item]));
  let offset = resume?.offset ?? 0;
  let unread = head?.unread ?? 0;
  for (let requests = 0; requests < budget && current(); requests++) {
    const page = offset === 0 && head ? head : await read<NotificationInboxPage>(unreadInboxPath(offset));
    if (!current()) return undefined;
    // A changed unread count or overlapping page means offsets shifted in-flight.
    if (head && page.unread !== head.unread) return { items: head.records, unread: head.unread, offset: undefined };
    unread = page.unread;
    const previous = items.size;
    for (const item of page.records) items.set(item.id, item);
    offset += page.records.length;
    if (items.size - previous !== page.records.length && head) return { items: head.records, unread: head.unread, offset: undefined };
    if (!page.records.length || items.size === previous || offset >= page.total) return { items: [...items.values()], unread, offset: undefined };
  }
  return current() ? { items: [...items.values()], unread, offset } : undefined;
}

export function recoveryWindow<T>(pending: T[], olderOffset: number) {
  const recent = pending.slice(0, 8);
  const olderCount = pending.length - recent.length;
  if (olderCount <= 8) return { selected: pending, next: 0 };
  const start = olderOffset % olderCount;
  const older = Array.from({ length: 8 }, (_, index) => pending[recent.length + ((start + index) % olderCount)]);
  return { selected: [...recent, ...older], next: (start + older.length) % olderCount };
}

export async function checkRecoveries(items: NotificationInboxItem[], ledger: RecoveryLedger, {
  read, load, save, current, now, select,
}: { read: InboxRead; load: (key: string) => Promise<string | null>; save: (key: string, value: string) => Promise<void>; current: () => boolean; now?: number; select?: <T>(rows: T[]) => T[] }) {
  const next = { ...ledger };
  const clock = () => now ?? Date.now();
  const resources = new Map<string, NotificationInboxItem[]>();
  for (const item of items) {
    const key = recoveryKey(item);
    if (key && !isRecovered(item, ledger)) { const group = resources.get(key) ?? []; group.push(item); resources.set(key, group); }
  }
  const entries = [...resources.entries()];
  const queue = select ? select(entries) : entries;
  // Bound parallel reads; a busy Inbox must not flood the API with reports.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (current()) {
      const entry = queue.shift();
      if (!entry) return;
      const [key, alerts] = entry;
      const item = alerts[0];
      try {
        const saved = key in next ? next[key] : Number(await load(key).catch(() => null));
        if (!current()) return;
        if (Number.isFinite(saved) && saved > 0 && saved <= clock() + 60_000) next[key] = Math.max(next[key] ?? 0, saved);
        if (alerts.every((candidate) => isRecovered(candidate, next))) continue;
        const monitor = item.resourceType === 'monitor';
        const evidence = monitor ? monitorRecoveryEvidence(await readStatusReport(`/v2/monitors/${encodeURIComponent(item.resourceId)}/uptime?window=1h`, read), clock()) : await (async () => {
          const status = await read<{ status: string; lastSeenAt?: string | null }>(`/v2/gateways/${encodeURIComponent(item.resourceId)}`);
          return { healthy: status.status?.toLowerCase() === 'online', at: status.lastSeenAt };
        })();
        if (!current()) return;
        // Monitor reports compute a fresh current snapshot. generatedAt is ISO;
        // lastUpdated is only a display clock. Gateways expose heartbeat time.
        const at = Date.parse(evidence.at ?? '');
        if (!evidence.healthy || !Number.isFinite(at) || at > clock() + 60_000 || clock() - at > 5 * 60_000) continue;
        if (at > (next[key] ?? 0)) {
          next[key] = at;
          await save(key, String(at)).catch(() => undefined);
        }
      } catch { /* Missing/deleted/forbidden is not recovery. Keep the alert. */ }
    }
  }));
  return current() ? next : undefined;
}
