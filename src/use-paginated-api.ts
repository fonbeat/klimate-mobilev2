import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, messageOf } from './api';
import { useSession } from './session';
import { itemKey, refreshOffsets, mergeRefreshedPage } from './page-refresh';
import { useAuthenticatedRequest } from './use-api';
import { sessionScope } from './session-authority';

type PaginatedOptions<TPage, TItem> = {
  enabled?: boolean;
  pageSize?: number;
  path: (offset: number, pageSize: number) => string;
  items: (page: TPage) => TItem[];
  total: (page: TPage) => number;
  onPage?: (page: TPage) => void;
};

export function usePaginatedApi<TPage, TItem>({ enabled = true, pageSize = 30, path, items: selectItems, total: selectTotal, onPage }: PaginatedOptions<TPage, TItem>) {
  const { session } = useSession();
  const request = useAuthenticatedRequest();
  const requestRef = useRef(request);
  requestRef.current = request;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const scope = session ? `${session.user.ID}:${session.tenantId ?? ''}` : '';
  const dataKey = `${scope}:${path(0, pageSize)}`;
  const dataScope = useRef(dataKey);
  const [records, setRecords] = useState<TItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const recordsRef = useRef(records); recordsRef.current = records;
  const totalRef = useRef(total); totalRef.current = total;
  const visible = useRef<number[]>([]);
  const changed = useRef(false);
  const refreshRequest = useRef<() => void>(() => {});
  const viewRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleKey = useRef('0');
  const pageCheckedAt = useRef(new Map<number, number>());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: unknown; index?: number | null }[] }) => {
    // Inbox can hide recovered rows; resolve original server positions by identity.
    const positions = new Map(recordsRef.current.map((item, index) => [itemKey(item), index]));
    visible.current = viewableItems.map(({ item, index }) => positions.get(itemKey(item)) ?? index ?? 0);
    const key = refreshOffsets(visible.current, recordsRef.current.length, pageSize).join(':');
    if (key !== visibleKey.current) {
      visibleKey.current = key;
      if (viewRefresh.current) clearTimeout(viewRefresh.current);
      const stale = refreshOffsets(visible.current, recordsRef.current.length, pageSize).some((offset) => Date.now() - (pageCheckedAt.current.get(offset) ?? 0) >= 30_000);
      if (stale) viewRefresh.current = setTimeout(() => refreshRequest.current(), 300);
    }
  }, [pageSize]);

  const requestPage = useCallback((offset: number, mode: 'initial' | 'refresh' | 'more' | 'background'): Promise<void> => {
    const currentSession = sessionRef.current;
    if (!enabled || !currentSession || sessionScope(currentSession) !== scope) return Promise.resolve();
    if (pending.current) return pending.current;
    const id = ++requestId.current;
    const operation = (async () => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    try {
      const read = requestRef.current;
      if (mode === 'background' && changed.current) {
        setError('The list has changed. Pull down to refresh the latest items.');
        return;
      }
      const offsets = mode === 'background' ? refreshOffsets(visible.current, recordsRef.current.length, pageSize) : [offset];
      let nextItems = recordsRef.current;
      let nextTotal = totalRef.current;
      for (const pageOffset of offsets) {
        const page = await read<TPage>(path(pageOffset, pageSize));
        if (requestId.current !== id) return;
        pageCheckedAt.current.set(pageOffset, Date.now());
        const incoming = selectItems(page);
        const count = selectTotal(page);
        if (!incoming.length && pageOffset < count) throw new ApiError('Klimate returned an incomplete list. Pull down to try again.', 502, 'INVALID_RESPONSE');
        const loadedKeys = mode === 'more' ? new Set(nextItems.map(itemKey)) : null;
        if (mode === 'more' && (count !== nextTotal || incoming.some((item) => loadedKeys!.has(itemKey(item))))) {
          changed.current = true;
          setError('The list has changed. Pull down to refresh the latest items.');
          return;
        }
        onPage?.(page);
        if (mode === 'background') {
          const merged = mergeRefreshedPage(nextItems, incoming, pageOffset, count, nextTotal, pageSize);
          if (!merged) {
            changed.current = true;
            setError('The list has changed. Pull down to refresh the latest items.');
            return;
          }
          nextItems = merged;
        } else nextItems = mode === 'more' ? [...nextItems, ...incoming] : incoming;
        nextTotal = count;
      }
      dataScope.current = dataKey;
      recordsRef.current = nextItems;
      totalRef.current = nextTotal;
      setRecords(nextItems);
      setTotal(nextTotal);
      setError(null);
      if (mode !== 'background') changed.current = false;
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(messageOf(caught));
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403 || caught.code === 'INVALID_RESPONSE')) {
        recordsRef.current = []; totalRef.current = 0; setRecords([]); setTotal(0);
      }
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
    })();
    pending.current = operation;
    void operation.finally(() => { if (pending.current === operation) pending.current = null; }).catch(() => undefined);
    return operation;
  }, [enabled, onPage, pageSize, path, selectItems, selectTotal, scope, dataKey]);

  refreshRequest.current = () => { void requestPage(0, 'background'); };
  useEffect(() => {
    requestId.current += 1;
    pending.current = null;
    recordsRef.current = []; totalRef.current = 0; visible.current = []; visibleKey.current = '0'; changed.current = false; pageCheckedAt.current.clear();
    setRefreshing(false);
    setLoadingMore(false);
    setRecords([]); setTotal(0); setError(null);
    if (!enabled) {
      requestId.current += 1;
      setLoading(false);
      return;
    }
    void requestPage(0, 'initial');
    return () => { requestId.current += 1; if (viewRefresh.current) clearTimeout(viewRefresh.current); };
  }, [enabled, requestPage]);

  const visibleRecords = dataScope.current === dataKey ? records : [];
  const visibleTotal = dataScope.current === dataKey ? total : 0;
  const hasMore = visibleRecords.length < visibleTotal;
  const invalidate = useCallback(() => {
    requestId.current += 1;
    pending.current = null;
    setLoading(false); setRefreshing(false); setLoadingMore(false);
  }, []);
  return {
    onViewableItemsChanged,
    records: visibleRecords, total: visibleTotal, loading, refreshing, loadingMore, error, hasMore,
    setRecords, invalidate, reload: () => requestPage(0, 'refresh'), refreshVisible: () => requestPage(0, 'background'),
    loadMore: () => { if (!loading && !refreshing && !loadingMore && hasMore && !changed.current) void requestPage(records.length, 'more'); },
  };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}
