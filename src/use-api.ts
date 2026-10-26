import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, messageOf } from './api';
import { useSession } from './session';
import { authenticatedRequest, sessionScope } from './session-authority';

export function useApiData<T>(path: string, enabled = true) {
  const { session } = useSession();
  const request = useAuthenticatedRequest();
  const requestRef = useRef(request);
  requestRef.current = request;
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
    if (!currentSession || !enabled || sessionScope(currentSession) !== scope) return;
    const id = ++requestId.current;
    if (mode === 'manual') setRefreshing(true);
    if (mode === 'initial') setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const next = await requestRef.current<T>(path);
      if (requestId.current === id) { dataScope.current = scope; setData(next); }
    } catch (first) {
      if (requestId.current !== id) return;
      if (requestId.current === id) {
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
  }, [enabled, path, scope]);

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
  const { session, authority } = useSession();
  const lease = useMemo(() => authority.capture(), [authority, session]);
  return useCallback(async <T,>(path: string, init: Omit<Parameters<typeof api<T>>[1], 'token'> = {}) => {
    return authenticatedRequest<T>(authority, lease, path, init, api);
  }, [authority, lease]);
}
