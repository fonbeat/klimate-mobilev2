import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from './api';
import { useSession } from './session';
import { readPageRange } from './read-page-range';
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
  const dataScope = useRef(scope);
  const [records, setRecords] = useState<TItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const loadedCount = useRef(0);

  const requestPage = useCallback((offset: number, mode: 'initial' | 'refresh' | 'more' | 'background'): Promise<void> => {
    const currentSession = sessionRef.current;
    if (!enabled || !currentSession || sessionScope(currentSession) !== scope) return Promise.resolve();
    if (pending.current) return pending.current;
    const id = ++requestId.current;
    const operation = (async () => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    setError(null);
    try {
      const read = requestRef.current;
      const wanted = mode === 'background' ? Math.max(pageSize, loadedCount.current) : pageSize;
      const range = await readPageRange<TPage, TItem>({ offset, pageSize, wanted, current: () => requestId.current === id,
        items: selectItems, total: selectTotal, onPage, read: (pageOffset, limit) => read<TPage>(path(pageOffset, limit)) });
      if (!range || requestId.current !== id) return;
      const nextItems = range.records;
      dataScope.current = scope;
      setRecords((current) => mode === 'more' ? [...current, ...nextItems] : nextItems);
      loadedCount.current = mode === 'more' ? offset + nextItems.length : nextItems.length;
      setTotal(range.total);
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(messageOf(caught));
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
  }, [enabled, onPage, pageSize, path, selectItems, selectTotal, scope]);

  useEffect(() => {
    requestId.current += 1;
    pending.current = null;
    loadedCount.current = 0;
    setRefreshing(false);
    setLoadingMore(false);
    if (!enabled) {
      requestId.current += 1;
      setLoading(false);
      return;
    }
    setRecords([]);
    setTotal(0);
    void requestPage(0, 'initial');
    return () => { requestId.current += 1; };
  }, [enabled, requestPage]);

  const visibleRecords = dataScope.current === scope ? records : [];
  const visibleTotal = dataScope.current === scope ? total : 0;
  const hasMore = visibleRecords.length < visibleTotal;
  const invalidate = useCallback(() => {
    requestId.current += 1;
    pending.current = null;
    setLoading(false); setRefreshing(false); setLoadingMore(false);
  }, []);
  return {
    records: visibleRecords, total: visibleTotal, loading, refreshing, loadingMore, error, hasMore,
    setRecords, invalidate, reload: () => requestPage(0, 'refresh'), refreshVisible: () => requestPage(0, 'background'),
    loadMore: () => { if (!loading && !refreshing && !loadingMore && hasMore) void requestPage(records.length, 'more'); },
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
