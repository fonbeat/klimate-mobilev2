import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { getInstallationId } from './notifications';
import { createRefreshCoordinator } from './refresh-coordinator';
import type { LoginChallenge, Session } from './types';

const SESSION_KEY = 'klimate.session.v1';

type PendingLoginChallenge = LoginChallenge & { email: string };

type SessionContextValue = {
  session: Session | null;
  pendingLoginChallenge: PendingLoginChallenge | null;
  loading: boolean;
  login(email: string, password: string): Promise<LoginChallenge>;
  verify(code: string): Promise<void>;
  refresh(): Promise<Session>;
  switchOrganization(tenantId: string): Promise<void>;
  signOut(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [pendingLoginChallenge, setPendingLoginChallenge] = useState<PendingLoginChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const refreshCoordinatorRef = useRef(createRefreshCoordinator<Session>());
  const sessionGenerationRef = useRef(0);

  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY)
      .then((value) => {
        if (!value) return;
        const restored = JSON.parse(value) as Session;
        sessionRef.current = restored;
        setSession(restored);
      })
      .catch(() => SecureStore.deleteItemAsync(SESSION_KEY))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: Session | null, expectedGeneration = sessionGenerationRef.current) => {
    if (next) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
    if (sessionGenerationRef.current !== expectedGeneration) {
      const current = sessionRef.current;
      if (current) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(current)).catch(() => undefined);
      else await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
      throw new Error('The session changed before it could be saved.');
    }
    sessionRef.current = next;
    setSession(next);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const challenge = await api<LoginChallenge>('/v2/sessions/login', {
      method: 'POST', body: JSON.stringify({ email: normalizedEmail, password }),
    });
    setPendingLoginChallenge({ ...challenge, email: normalizedEmail });
    return challenge;
  }, []);

  const verify = useCallback(async (code: string) => {
    if (!pendingLoginChallenge?.verificationToken) throw new Error('Your verification session has expired. Sign in again.');
    const next = await api<Session>('/v2/sessions/verify', {
      method: 'POST',
      body: JSON.stringify({ token: pendingLoginChallenge.verificationToken, code }),
    });
    await persist(next);
    setPendingLoginChallenge(null);
  }, [pendingLoginChallenge, persist]);

  const refresh = useCallback(() => {
    return refreshCoordinatorRef.current.run(async () => {
      const refreshToken = sessionRef.current?.refreshToken;
      if (!refreshToken) throw new Error('Your session has expired.');
      const generation = sessionGenerationRef.current;
      const next = await api<Session>('/v2/sessions/refresh', {
        method: 'POST', body: JSON.stringify({ refreshToken }),
      });
      if (sessionRef.current?.refreshToken !== refreshToken) throw new Error('The session changed while it was being refreshed.');
      await persist(next, generation);
      return next;
    });
  }, [persist]);

  const switchOrganization = useCallback(async (tenantId: string) => {
    let current = sessionRef.current;
    if (!current?.refreshToken || !current.accessToken || !tenantId || tenantId === current.tenantId) return;
    const generation = sessionGenerationRef.current;
    try {
      const next = await api<Session>('/v2/sessions/switch', {
        method: 'POST', token: current.accessToken,
        body: JSON.stringify({ tenantId, refreshToken: current.refreshToken }),
      });
      await persist(next, generation);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'ACCESS_TOKEN_EXPIRED') throw error;
      current = await refresh();
      const next = await api<Session>('/v2/sessions/switch', {
        method: 'POST', token: current.accessToken,
        body: JSON.stringify({ tenantId, refreshToken: current.refreshToken }),
      });
      await persist(next, generation);
    }
  }, [persist, refresh]);

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    sessionGenerationRef.current += 1;
    sessionRef.current = null;
    setSession(null);
    setPendingLoginChallenge(null);
    refreshCoordinatorRef.current.clear();
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);

    const requests: Promise<unknown>[] = [];
    if (current?.accessToken) {
      requests.push(getInstallationId().then((installationId) => api(`/v2/push/devices/${encodeURIComponent(installationId)}`, {
        method: 'DELETE', token: current.accessToken,
      })).catch(() => undefined));
    }
    if (current?.refreshToken) {
      requests.push(api('/v2/sessions/logout', {
        method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }),
      }).catch(() => undefined));
    }
    await Promise.all(requests);
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    session,
    pendingLoginChallenge,
    loading,
    login,
    verify,
    refresh,
    switchOrganization,
    signOut,
  }), [session, pendingLoginChallenge, loading, login, verify, refresh, switchOrganization, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
