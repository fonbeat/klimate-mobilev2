import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, messageOf } from './api';
import { useSession } from './session';

export function useApiData<T>(path: string) {
  const { session, refresh, signOut } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (!session) return;
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path, { token: session.accessToken }));
    } catch (first) {
      if (first instanceof ApiError && first.status === 401 && first.code === 'ACCESS_TOKEN_EXPIRED') {
        try {
          const next = await refresh();
          setData(await api<T>(path, { token: next.accessToken }));
        } catch (second) {
          setError(messageOf(second));
          await signOut();
        }
      } else setError(messageOf(first));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [path, refresh, session, signOut]);

  useEffect(() => { void load(); }, [load]);
  return { data, loading, refreshing, error, reload: () => load(true) };
}
