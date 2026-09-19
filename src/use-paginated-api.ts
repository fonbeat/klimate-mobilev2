import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, messageOf } from './api';
import { useSession } from './session';

type PaginatedOptions<TPage, TItem> = {
  enabled?: boolean;
  pageSize?: number;
  path: (offset: number, pageSize: number) => string;
  items: (page: TPage) => TItem[];
  total: (page: TPage) => number;
  onPage?: (page: TPage) => void;
};

export function usePaginatedApi<TPage, TItem>({ enabled = true, pageSize = 30, path, items: selectItems, total: selectTotal, onPage }: PaginatedOptions<TPage, TItem>) {
  const { session, refresh, signOut } = useSession();
  const [records, setRecords] = useState<TItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const requestPage = useCallback(async (offset: number, mode: 'initial' | 'refresh' | 'more') => {
    if (!enabled || !session) return;
    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    setError(null);
    try {
      let accessToken = session.accessToken;
      let page: TPage;
      try {
        page = await api<TPage>(path(offset, pageSize), { token: accessToken });
      } catch (first) {
        if (!(first instanceof ApiError) || first.status !== 401 || first.code !== 'ACCESS_TOKEN_EXPIRED') throw first;
        const next = await refresh();
        accessToken = next.accessToken;
        page = await api<TPage>(path(offset, pageSize), { token: accessToken });
      }
      if (requestId.current !== id) return;
      const nextItems = selectItems(page);
      setRecords((current) => mode === 'more' ? [...current, ...nextItems] : nextItems);
      setTotal(selectTotal(page));
      onPage?.(page);
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(messageOf(caught));
      if (caught instanceof ApiError && caught.status === 401) await signOut();
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [enabled, onPage, pageSize, path, refresh, selectItems, selectTotal, session, signOut]);

  useEffect(() => {
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

  const hasMore = records.length < total;
  return {
    records, total, loading, refreshing, loadingMore, error, hasMore,
    setRecords, reload: () => requestPage(0, 'refresh'),
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
