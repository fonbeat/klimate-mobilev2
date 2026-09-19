import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, messageOf } from './api';
import { useSession } from './session';

export function useApiData<T>(path: string, enabled = true) {
  const { session, refresh, signOut } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!session || !enabled) return;
    const id = ++requestId.current;
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const next = await api<T>(path, { token: session.accessToken });
      if (requestId.current === id) setData(next);
    } catch (first) {
      if (first instanceof ApiError && first.status === 401 && first.code === 'ACCESS_TOKEN_EXPIRED') {
        try {
          const next = await refresh();
          const retried = await api<T>(path, { token: next.accessToken });
          if (requestId.current === id) setData(retried);
        } catch (second) {
          if (requestId.current === id) setError(messageOf(second));
          if (second instanceof ApiError && second.status === 401) await signOut();
        }
      } else if (requestId.current === id) setError(messageOf(first));
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled, path, refresh, session, signOut]);

  useEffect(() => {
    if (enabled) void load();
    else {
      requestId.current += 1;
      setLoading(false);
    }
    return () => { requestId.current += 1; };
  }, [enabled, load]);
  const reload = useCallback(() => load(true), [load]);
  return { data, setData, loading, refreshing, error, reload };
}

export function useAuthenticatedRequest() {
  const { session, refresh, signOut } = useSession();
  return useCallback(async <T,>(path: string, init: Omit<Parameters<typeof api<T>>[1], 'token'> = {}) => {
    if (!session) throw new Error('Your session has expired.');
    try {
      return await api<T>(path, { ...init, token: session.accessToken });
    } catch (first) {
      if (!(first instanceof ApiError) || first.status !== 401 || first.code !== 'ACCESS_TOKEN_EXPIRED') throw first;
      try {
        const next = await refresh();
        return await api<T>(path, { ...init, token: next.accessToken });
      } catch (second) {
        if (second instanceof ApiError && second.status === 401) await signOut();
        throw second;
      }
    }
  }, [refresh, session, signOut]);
}
