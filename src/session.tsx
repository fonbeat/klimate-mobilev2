import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from './api';
import { getInstallationId } from './notifications';
import type { LoginChallenge, Session } from './types';

const SESSION_KEY = 'klimate.session.v1';

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
  login(email: string, password: string): Promise<LoginChallenge>;
  verify(token: string, code: string): Promise<void>;
  refresh(): Promise<Session>;
  switchOrganization(tenantId: string): Promise<void>;
  signOut(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY)
      .then((value) => value && setSession(JSON.parse(value)))
      .catch(() => SecureStore.deleteItemAsync(SESSION_KEY))
      .finally(() => setLoading(false));
  }, []);

  async function persist(next: Session | null) {
    setSession(next);
    if (next) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  const value = useMemo<SessionContextValue>(() => ({
    session,
    loading,
    login: (email, password) => api<LoginChallenge>('/v2/sessions/login', {
      method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    }),
    verify: async (token, code) => {
      const next = await api<Session>('/v2/sessions/verify', { method: 'POST', body: JSON.stringify({ token, code }) });
      await persist(next);
    },
    refresh: async () => {
      if (!session?.refreshToken) throw new Error('Your session has expired.');
      const next = await api<Session>('/v2/sessions/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) });
      await persist(next);
      return next;
    },
    switchOrganization: async (tenantId) => {
      if (!session?.refreshToken || !session.accessToken || !tenantId || tenantId === session.tenantId) return;
      let current = session;
      try {
        const next = await api<Session>('/v2/sessions/switch', {
          method: 'POST', token: current.accessToken,
          body: JSON.stringify({ tenantId, refreshToken: current.refreshToken }),
        });
        await persist(next);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'ACCESS_TOKEN_EXPIRED') throw error;
        current = await api<Session>('/v2/sessions/refresh', {
          method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        await persist(current);
        const next = await api<Session>('/v2/sessions/switch', {
          method: 'POST', token: current.accessToken,
          body: JSON.stringify({ tenantId, refreshToken: current.refreshToken }),
        });
        await persist(next);
      }
    },
    signOut: async () => {
      const token = session?.refreshToken;
      const accessToken = session?.accessToken;
      if (accessToken) {
        const installationId = await getInstallationId();
        await api(`/v1/push/devices/${encodeURIComponent(installationId)}`, { method: 'DELETE', token: accessToken }).catch(() => undefined);
      }
      await persist(null);
      if (token) await api('/v2/sessions/logout', { method: 'POST', body: JSON.stringify({ refreshToken: token }) }).catch(() => undefined);
    },
  }), [session, loading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
