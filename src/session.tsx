import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { retirePushSession, setPushSession, syncAppBadge } from './notifications';
import { authenticatedRequest, SessionAuthority, type PendingLoginChallenge } from './session-authority';
import type { LoginChallenge, Session } from './types';

const SESSION_KEY = 'klimate.session.v1';
const SIGNED_OUT = 'signed-out';
type SessionContextValue = {
  session: Session | null;
  authority: SessionAuthority;
  pendingLoginChallenge: PendingLoginChallenge | null;
  loading: boolean;
  signOutWarning: string;
  login(email: string, password: string): Promise<LoginChallenge>;
  verify(code: string): Promise<void>;
  refresh(): Promise<Session>;
  switchOrganization(tenantId: string, name?: string): Promise<void>;
  signOut(): Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [pendingLoginChallenge, setPendingLoginChallenge] = useState<PendingLoginChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [localSignOutFailed, setLocalSignOutFailed] = useState(false);
  const [remoteSignOutFailed, setRemoteSignOutFailed] = useState(false);
  const authorityRef = useRef<SessionAuthority | null>(null);
  if (!authorityRef.current) authorityRef.current = new SessionAuthority({
    read: api,
    restore: async () => {
      const saved = await SecureStore.getItemAsync(SESSION_KEY);
      return saved === SIGNED_OUT ? null : saved;
    },
    save: async (next) => {
      if (next) {
        await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
        setLocalSignOutFailed(false);
        setRemoteSignOutFailed(false);
        return;
      }
      // Replace the credentials even if the platform cannot delete the key.
      try { await SecureStore.setItemAsync(SESSION_KEY, SIGNED_OUT); }
      catch {
        try { await SecureStore.deleteItemAsync(SESSION_KEY); }
        catch (error) { setLocalSignOutFailed(true); throw error; }
      }
      setLocalSignOutFailed(false);
    },
    changed: (next) => {
      setPushSession(next, (path, init) => authenticatedRequest(authorityRef.current!, authorityRef.current!.capture(), path, init, api));
      setSession(next);
      if (!next) syncAppBadge(0);
    },
    challenge: setPendingLoginChallenge,
    retire: async (previous) => {
      try { await retirePushSession(previous); }
      catch { if (!authorityRef.current?.get()) setRemoteSignOutFailed(true); }
    },
    // A rotated token returned after logout is revoked, never published locally.
    discard: (next) => api('/v2/sessions/logout', { method: 'POST', body: JSON.stringify({ refreshToken: next.refreshToken }) }),
  });
  const authority = authorityRef.current;
  const signOutWarning = localSignOutFailed
    ? 'This phone could not clear the saved session. Sign-out could not be confirmed.'
    : remoteSignOutFailed ? 'Signed out on this phone. Klimate could not confirm that the server session ended.' : '';
  useEffect(() => { void authority.restore().catch(() => undefined).finally(() => setLoading(false)); }, [authority]);
  const value = useMemo<SessionContextValue>(() => ({
    session, authority, pendingLoginChallenge, loading, signOutWarning,
    login: authority.login, verify: authority.verify, refresh: authority.refresh,
    switchOrganization: authority.switchOrganization, signOut: authority.signOut,
  }), [session, authority, pendingLoginChallenge, loading, signOutWarning]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
