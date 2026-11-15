import { ApiError, type api } from './api.ts';
import { restorableSession, validMfaChallenge, validSession } from './response-validation.ts';
import type { LoginChallenge, Session } from './types';

export class SessionChangedError extends Error {
  constructor() { super('Your session or organization changed. Please try again.'); }
}
export const sessionScope = (session: Session | null) => session ? `${session.user.ID}:${session.tenantId ?? ''}` : '';
export type SessionLease = { current: () => boolean; session: () => Session };
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work);
    tail = next.catch(() => undefined);
    return next;
  };
}

export type PendingLoginChallenge = LoginChallenge & { email: string; organization?: { id: string; name?: string } };
type Options = {
  read: typeof api;
  restore: () => Promise<string | null>;
  save: (session: Session | null) => Promise<void>;
  changed: (session: Session | null) => void;
  challenge: (challenge: PendingLoginChallenge | null) => void;
  retire: (session: Session) => Promise<void>;
  discard: (session: Session) => Promise<void>;
};

/** Network session mutations and secure-storage commits have independent queues:
 * logout clears local credentials without waiting for an old network request. */
export class SessionAuthority {
  private value: Session | null = null;
  private generation = 0;
  private pendingChallenge: PendingLoginChallenge | null = null;
  private switching?: number;
  private mutate = serialQueue();
  private storage = serialQueue();
  private refreshing?: { generation: number; operation: Promise<Session> };
  private options: Options;
  constructor(options: Options) { this.options = options; }

  get = () => this.value;
  capture = (): SessionLease => {
    const generation = this.generation;
    const current = () => generation === this.generation && !!this.value;
    return { current, session: () => { if (!current()) throw new SessionChangedError(); return this.value!; } };
  };
  private assert(generation: number) { if (generation !== this.generation) throw new SessionChangedError(); }
  invalidateAuthentication = () => {
    // The switch can revoke the old token before the response reaches the phone.
    if (this.switching !== this.generation) void this.signOut().catch(() => undefined);
  };
  private publish(next: Session | null) {
    if (sessionScope(next) !== sessionScope(this.value)) this.generation++;
    this.value = next;
    this.options.changed(next);
  }
  private commit(next: Session, generation: number) {
    return this.storage(async () => {
      this.assert(generation);
      await this.options.save(next);
      this.assert(generation);
      this.publish(next);
    });
  }
  private async received(next: Session, generation: number) {
    if (!validSession(next)) throw new ApiError('Klimate returned an invalid sign-in response.', 502, 'INVALID_RESPONSE');
    try { await this.commit(next, generation); }
    catch (error) {
      // A rotated token received after logout must never restore the UI/session.
      void this.options.discard(next).catch(() => undefined);
      throw error;
    }
    return next;
  }
  async restore() {
    const generation = this.generation;
    await this.storage(async () => {
      const saved = await this.options.restore();
      this.assert(generation);
      if (!saved) return;
      try {
        const next = JSON.parse(saved) as Session;
        if (!restorableSession(next)) throw new Error('Invalid saved session');
        this.publish(next);
      } catch { await this.options.save(null); }
    });
  }
  login = (email: string, password: string) => {
    const generation = ++this.generation;
    this.pendingChallenge = null;
    this.options.challenge(null);
    return this.mutate(async () => {
      this.assert(generation);
      const normalized = email.trim().toLowerCase();
      const challenge = await this.options.read<LoginChallenge>('/v2/sessions/login', { method: 'POST', body: JSON.stringify({ email: normalized, password }) });
      if (challenge.accessToken && challenge.refreshToken) await this.received(challenge as Session, generation);
      else {
        this.assert(generation);
        if (!validMfaChallenge(challenge)) throw new Error('Klimate returned an unsupported sign-in response. Please try again.');
        this.pendingChallenge = { ...challenge, email: normalized };
        this.options.challenge(this.pendingChallenge);
      }
      return challenge;
    });
  };
  verify = (code: string) => {
    const generation = this.generation;
    const challenge = this.pendingChallenge;
    return this.mutate(async () => {
      this.assert(generation);
      if (!challenge?.mfaChallengeToken || challenge !== this.pendingChallenge) throw new Error('Your verification session has expired. Sign in again.');
      if (challenge.mfaEnrollmentRequired) throw new Error('Set up your authenticator in Klimate on the web, then sign in here.');
      const next = await this.options.read<Session>('/v2/sessions/mfa/verify', { method: 'POST', body: JSON.stringify({ token: challenge.mfaChallengeToken, code }) });
      if (challenge.organization && next.tenantId !== challenge.organization.id) {
        if (validSession(next)) void this.options.discard(next).catch(() => undefined);
        throw new ApiError('Klimate returned a session for a different organization. Sign in again.', 502, 'INVALID_RESPONSE');
      }
      await this.received(next, generation);
      this.pendingChallenge = null;
      this.options.challenge(null);
    });
  };
  private async refreshNow(generation: number) {
    this.assert(generation);
    const refreshToken = this.value?.refreshToken;
    if (!refreshToken) throw new Error('Your session has expired.');
    try {
      const next = await this.options.read<Session>('/v2/sessions/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
      return await this.received(next, generation);
    } catch (error) {
      if (generation === this.generation && error instanceof ApiError && error.status === 401) void this.signOut().catch(() => undefined);
      throw error;
    }
  }
  refresh = () => {
    const generation = this.generation;
    if (this.refreshing?.generation === generation) return this.refreshing.operation;
    const operation = this.mutate(() => this.refreshNow(generation));
    this.refreshing = { generation, operation };
    void operation.finally(() => { if (this.refreshing?.operation === operation) this.refreshing = undefined; }).catch(() => undefined);
    return operation;
  };
  switchOrganization = (tenantId: string, name?: string) => {
    const generation = this.generation;
    return this.mutate(async () => {
      this.assert(generation);
      if (!this.value || !tenantId || tenantId === this.value.tenantId) return;
      this.switching = generation;
      try {
        const send = () => this.options.read<Session | LoginChallenge>('/v2/sessions/switch', { method: 'POST', token: this.value!.accessToken, body: JSON.stringify({ tenantId, refreshToken: this.value!.refreshToken }) });
        let next: Session | LoginChallenge;
        try { next = await send(); }
        catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'ACCESS_TOKEN_EXPIRED' || error.status !== 401) throw error;
          await this.refreshNow(generation);
          this.assert(generation);
          next = await send();
        }
        if (validMfaChallenge(next) && !validSession(next)) {
          this.assert(generation);
          const previous = this.value!;
          this.pendingChallenge = { ...next, email: previous.user.email, organization: { id: tenantId, name } };
          this.options.challenge(this.pendingChallenge);
          this.publish(null);
          void this.options.retire(previous).catch(() => undefined);
          await this.storage(() => this.options.save(null));
          return;
        }
        await this.received(next as Session, generation);
      } catch (error) {
        if (generation === this.generation && error instanceof ApiError && error.status === 401) void this.signOut().catch(() => undefined);
        throw error;
      } finally { this.switching = undefined; }
    });
  };
  signOut = async () => {
    const retired = this.value;
    this.generation++;
    this.value = null;
    this.pendingChallenge = null;
    this.options.changed(null);
    this.options.challenge(null);
    // Queue push removal immediately, before another user can register this phone.
    const remote = retired ? this.options.retire(retired) : Promise.resolve();
    await Promise.all([this.storage(() => this.options.save(null)), remote]);
  };
}

export async function authenticatedRequest<T>(authority: SessionAuthority, lease: SessionLease, path: string, init: Omit<Parameters<typeof api>[1], 'token'> = {}, read: typeof api) {
  let result: T;
  try { result = await read<T>(path, { ...init, token: lease.session().accessToken }); }
  catch (error) {
    if (!lease.current()) throw new SessionChangedError();
    if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'ACCESS_TOKEN_EXPIRED') {
      if (error instanceof ApiError && error.status === 401) authority.invalidateAuthentication();
      throw error;
    }
    try {
      await authority.refresh();
      result = await read<T>(path, { ...init, token: lease.session().accessToken });
    } catch (second) {
      // Local invalidation is synchronous. Do not await remote push retirement
      // here: this request may itself be inside the push mutation queue.
      if (lease.current() && second instanceof ApiError && second.status === 401) authority.invalidateAuthentication();
      throw second;
    }
  }
  if (!lease.current()) throw new SessionChangedError();
  return result;
}
