import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, messageOf } from './api';
import { useSession } from './session';

export function useApiData<T>(path: string, enabled = true) {
  const { session, refresh, signOut } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const scope = session ? `${session.user.ID}:${session.tenantId ?? ''}` : '';
  const dataScope = useRef(scope);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const requestId = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'manual' | 'background' = 'initial') => {
    const currentSession = sessionRef.current;
    if (!currentSession || !enabled) return;
    const id = ++requestId.current;
    if (mode === 'manual') setRefreshing(true);
    if (mode === 'initial') setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const next = await api<T>(path, { token: currentSession.accessToken });
      if (requestId.current === id) { dataScope.current = scope; setData(next); }
    } catch (first) {
      if (requestId.current !== id) return;
      if (first instanceof ApiError && first.status === 401 && first.code === 'ACCESS_TOKEN_EXPIRED') {
        try {
          const next = await refresh();
          const retried = await api<T>(path, { token: next.accessToken });
          if (requestId.current === id) { dataScope.current = scope; setData(retried); }
        } catch (second) {
          if (requestId.current !== id) return;
          if (requestId.current === id) setError(messageOf(second));
          if (second instanceof ApiError && second.status === 401) await signOut();
        }
      } else if (requestId.current === id) {
        setError(messageOf(first));
        setErrorCode(first instanceof ApiError ? first.code : undefined);
        if (first instanceof ApiError && first.code === 'MODULE_DISABLED') setData(null);
      }
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled, path, refresh, scope, signOut]);

  useEffect(() => {
    setData(null);
    setError(null);
    if (enabled) void load();
    else {
      requestId.current += 1;
      setLoading(false);
    }
    return () => { requestId.current += 1; };
  }, [enabled, load]);
  const reload = useCallback(() => load('manual'), [load]);
  const refreshBackground = useCallback(() => load('background'), [load]);
  return { data: dataScope.current === scope ? data : null, setData, loading, refreshing, error, errorCode, reload, refreshBackground };
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
