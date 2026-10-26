import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { syncAppBadge } from './notifications';
import { useSession } from './session';
import { useAuthenticatedRequest } from './use-api';
import { checkRecoveries, isRecovered, outstandingUnread, recoveryStorageKey, type RecoveryLedger } from './inbox-recovery';
import { InboxHealthCache, UnreadInboxCache } from './inbox-refresh-cache';
import type { NotificationInboxItem } from './types';

type InboxBadgeContextValue = {
  unread: number | null;
  refresh: (force?: boolean) => Promise<void>;
  inspect: (items: NotificationInboxItem[]) => Promise<void>;
  recovered: (item: NotificationInboxItem) => boolean;
  invalidate: () => void;
  recordRead: (id?: string) => void;
};

const InboxBadgeContext = createContext<InboxBadgeContextValue | null>(null);

export function InboxBadgeProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const request = useAuthenticatedRequest();
  const scope = session ? `${session.user.ID}:${session.tenantId ?? ''}` : '';
  const cache = useMemo(() => ({ unread: new UnreadInboxCache(), health: new InboxHealthCache() }), [scope]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const revision = useRef(0);
  const pending = useRef<{ scope: string; operation: Promise<void> } | null>(null);
  type Snapshot = { scope: string; serverUnread: number | null; items: NotificationInboxItem[]; ledger: RecoveryLedger };
  const [snapshot, setSnapshot] = useState<Snapshot>({ scope: '', serverUnread: null, items: [], ledger: {} });
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const invalidate = useCallback(() => { revision.current++; pending.current = null; }, []);
  useEffect(() => invalidate, [scope, invalidate]);

  const recoveries = useCallback(async (items: NotificationInboxItem[], current: () => boolean) => {
    const ledger = snapshotRef.current.scope === scope ? snapshotRef.current.ledger : {};
    return checkRecoveries(items, ledger, { read: (path) => cache.health.read(path, request), current,
      load: (key) => cache.health.load(key, () => SecureStore.getItemAsync(recoveryStorageKey(scope, key))),
      save: (key, value) => SecureStore.setItemAsync(recoveryStorageKey(scope, key), value),
    });
  }, [request, scope, cache]);

  const refresh = useCallback((force = false): Promise<void> => {
    if (!scope) return Promise.resolve();
    if (force) { invalidate(); cache.health.clear(); }
    if (pending.current?.scope === scope) return pending.current.operation;
    const id = revision.current;
    const current = () => revision.current === id && scopeRef.current === scope;
    const operation = (async () => {
      try {
        const page = await cache.unread.read(request, current, force);
        if (!page) return;
        setSnapshot((previous) => ({ scope, serverUnread: page.unread, items: page.items, ledger: previous.scope === scope ? previous.ledger : {} }));
        const ledger = await recoveries(page.items, current);
        if (!ledger || !current()) return;
        setSnapshot((previous) => ({ scope, serverUnread: page.unread, items: page.items, ledger: mergeLedger(previous.scope === scope ? previous.ledger : {}, ledger) }));
      } catch { /* Preserve the last count if a refresh fails. */ }
    })();
    pending.current = { scope, operation };
    void operation.finally(() => { if (pending.current?.operation === operation) pending.current = null; });
    return operation;
  }, [recoveries, request, scope, cache, invalidate]);

  const inspect = useCallback(async (items: NotificationInboxItem[]) => {
    if (!scope || !items.length) return;
    const id = revision.current;
    const current = () => revision.current === id && scopeRef.current === scope;
    const ledger = await recoveries(items, current);
    if (ledger && current()) setSnapshot((previous) => previous.scope === scope
      ? { ...previous, ledger: mergeLedger(previous.ledger, ledger) }
      : { scope, serverUnread: null, items: [], ledger });
  }, [recoveries, scope]);

  const recordRead = useCallback((id?: string) => {
    invalidate();
    cache.unread.recordRead(id);
    setSnapshot((previous) => {
      if (previous.scope !== scope) return previous;
      if (!id) return { ...previous, serverUnread: 0, items: [] };
      const wasUnread = previous.items.some((item) => item.id === id && !item.read);
      return { ...previous, serverUnread: previous.serverUnread == null ? null : Math.max(0, previous.serverUnread - (wasUnread ? 1 : 0)), items: previous.items.filter((item) => item.id !== id) };
    });
  }, [invalidate, scope, cache]);
  const ledger = useMemo(() => snapshot.scope === scope ? snapshot.ledger : {}, [scope, snapshot]);
  const unread = snapshot.scope === scope && snapshot.serverUnread != null ? outstandingUnread(snapshot.serverUnread, snapshot.items, ledger) : null;
  const recovered = useCallback((item: NotificationInboxItem) => isRecovered(item, ledger), [ledger]);

  useEffect(() => { syncAppBadge(unread ?? 0); }, [unread, scope]);
  const value = useMemo(() => ({ unread, refresh, inspect, recovered, invalidate, recordRead }), [unread, refresh, inspect, recovered, invalidate, recordRead]);
  return <InboxBadgeContext.Provider value={value}>{children}</InboxBadgeContext.Provider>;
}

function mergeLedger(previous: RecoveryLedger, next: RecoveryLedger) {
  const merged = { ...previous };
  for (const [key, at] of Object.entries(next)) merged[key] = Math.max(merged[key] ?? 0, at);
  return merged;
}

export function useInboxBadge() {
  const context = useContext(InboxBadgeContext);
  if (!context) throw new Error('Inbox badge is unavailable.');
  return context;
}
