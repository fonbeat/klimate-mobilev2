import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { retirePushSession, setPushSession, syncAppBadge } from './notifications';
import { authenticatedRequest, SessionAuthority } from './session-authority';
import type { LoginChallenge, Session } from './types';

const SESSION_KEY = 'klimate.session.v1';
type PendingLoginChallenge = LoginChallenge & { email: string };
type SessionContextValue = {
  session: Session | null;
  authority: SessionAuthority;
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
  const authorityRef = useRef<SessionAuthority | null>(null);
  if (!authorityRef.current) authorityRef.current = new SessionAuthority({
    read: api,
    restore: () => SecureStore.getItemAsync(SESSION_KEY),
    save: (next) => next ? SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next)) : SecureStore.deleteItemAsync(SESSION_KEY),
    changed: (next) => {
      setPushSession(next, (path, init) => authenticatedRequest(authorityRef.current!, authorityRef.current!.capture(), path, init, api));
      setSession(next);
      if (!next) syncAppBadge(0);
    },
    challenge: setPendingLoginChallenge,
    retire: retirePushSession,
    // A rotated token returned after logout is revoked, never published locally.
    discard: (next) => api('/v2/sessions/logout', { method: 'POST', body: JSON.stringify({ refreshToken: next.refreshToken }) }),
  });
  const authority = authorityRef.current;
  useEffect(() => { void authority.restore().catch(() => undefined).finally(() => setLoading(false)); }, [authority]);
  const value = useMemo<SessionContextValue>(() => ({
    session, authority, pendingLoginChallenge, loading,
    login: authority.login, verify: authority.verify, refresh: authority.refresh,
    switchOrganization: authority.switchOrganization, signOut: authority.signOut,
  }), [session, authority, pendingLoginChallenge, loading]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
