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

export async function readUnreadInbox(read: InboxRead, current: () => boolean, head?: NotificationInboxPage) {
  const items = new Map<string, NotificationInboxItem>();
  let offset = 0;
  let unread = 0;
  do {
    const page = offset === 0 && head ? head : await read<NotificationInboxPage>(`/v2/notifications?offset=${offset}&limit=100&unreadOnly=true`);
    if (!current()) return undefined;
    unread = page.unread;
    const previous = items.size;
    for (const item of page.records) items.set(item.id, item);
    offset += page.records.length;
    if (!page.records.length || items.size === previous || offset >= page.total) break;
  } while (current());
  return current() ? { items: [...items.values()], unread } : undefined;
}

export async function checkRecoveries(items: NotificationInboxItem[], ledger: RecoveryLedger, {
  read, load, save, current, now,
}: { read: InboxRead; load: (key: string) => Promise<string | null>; save: (key: string, value: string) => Promise<void>; current: () => boolean; now?: number }) {
  const next = { ...ledger };
  const clock = () => now ?? Date.now();
  const resources = new Map<string, NotificationInboxItem[]>();
  for (const item of items) {
    const key = recoveryKey(item);
    if (key) { const group = resources.get(key) ?? []; group.push(item); resources.set(key, group); }
  }
  const queue = [...resources.entries()];
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
