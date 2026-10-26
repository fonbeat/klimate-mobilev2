import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, type api } from './api.ts';
import { authenticatedRequest, SessionAuthority, SessionChangedError } from './session-authority.ts';
import type { Session } from './types.ts';

const session = (tenantId = 'A', accessToken = tenantId): Session => ({ user: { ID: 'u', firstname: 'Test', lastname: 'User', email: 'test@example.invalid', role: 'owner', isOwner: true, isAdmin: true }, tenantId, accessToken, refreshToken: `r-${accessToken}` });

test('a first terminal 401 signs out immediately, while forbidden access does not', async () => {
  for (const status of [401, 403]) {
    const h = harness(); await h.authority.restore();
    const read: typeof api = async () => { throw new ApiError('Access denied', status, 'ACCESS_REVOKED'); };
    await assert.rejects(authenticatedRequest(h.authority, h.authority.capture(), '/v2/test', {}, read));
    assert.equal(h.authority.get() === null, status === 401);
    assert.equal(h.requests.length, 0);
  }
});

test('restore deletes invalid saved credentials without publishing an authenticated user', async () => {
  for (const saved of ['invalid-json', '{}', JSON.stringify({ ...session(), refreshToken: {} }), JSON.stringify({ ...session(), sessionExpiresAt: '2000-01-01T00:00:00Z' })]) {
    const savedValues: unknown[] = []; const published: unknown[] = [];
    const authority = new SessionAuthority({ read: async () => { throw new Error('No network needed'); }, restore: async () => saved, save: async (value) => { savedValues.push(value); }, changed: (value) => { published.push(value); }, challenge: () => {}, retire: async () => {}, discard: async () => {} });
    await authority.restore();
    assert.equal(authority.get(), null);
    assert.deepEqual(savedValues, [null]);
    assert.deepEqual(published, []);
  }
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function harness(read?: typeof api, save?: (next: Session | null) => Promise<void>) {
  let stored: Session | null = session();
  const published: (Session | null)[] = [];
  const retired: Session[] = [];
  const discarded: Session[] = [];
  const requests: string[] = [];
  const authority = new SessionAuthority({
    read: read ?? (async <T>(path: string, init?: RequestInit) => {
      requests.push(path);
      return (path.endsWith('/switch') ? session(JSON.parse(String(init?.body)).tenantId) : path.endsWith('/refresh') ? session('A', 'A2') : session()) as T;
    }),
    restore: async () => JSON.stringify(stored),
    save: async (next) => { await save?.(next); stored = next; },
    changed: (next) => published.push(next), challenge: () => {},
    retire: async (next) => { retired.push(next); }, discard: async (next) => { discarded.push(next); },
  });
  return { authority, requests, retired, discarded, published, stored: () => stored };
}

test('refresh and organization switch serialize through secure-storage completion', async () => {
  const started = deferred<void>(); const release = deferred<void>();
  const h = harness(undefined, async (next) => { if (next?.accessToken === 'A2') { started.resolve(); await release.promise; } });
  await h.authority.restore();
  const oldLease = h.authority.capture();
  const refreshing = h.authority.refresh(); await started.promise;
  const switching = h.authority.switchOrganization('B');
  await Promise.resolve();
  assert.equal(h.requests.includes('/v2/sessions/switch'), false);
  release.resolve(); await refreshing; await switching;
  assert.equal(h.authority.get()?.tenantId, 'B');
  assert.equal(h.stored()?.tenantId, 'B');
  assert.equal(oldLease.current(), false);
});

test('an expired old-organization request is never retried with a new organization token', async () => {
  const h = harness(); await h.authority.restore();
  const lease = h.authority.capture(); const calls: string[] = [];
  const read: typeof api = async <T>(_path: string, init?: RequestInit & { token?: string }) => {
    calls.push(init?.token ?? '');
    await h.authority.switchOrganization('B');
    throw new ApiError('Expired', 401, 'ACCESS_TOKEN_EXPIRED');
  };
  await assert.rejects(authenticatedRequest(h.authority, lease, '/v2/notifications/read', { method: 'PATCH', body: '{}' }, read), SessionChangedError);
  assert.deepEqual(calls, ['A']);
  assert.equal(h.authority.get()?.tenantId, 'B');
});

test('logout during a secure-storage write clears storage after that write and never restores the session', async () => {
  const started = deferred<void>(); const release = deferred<void>();
  const h = harness(undefined, async (next) => { if (next?.accessToken === 'A2') { started.resolve(); await release.promise; } });
  await h.authority.restore();
  const refreshing = h.authority.refresh();
  const rejected = assert.rejects(refreshing, SessionChangedError);
  await started.promise;
  const logout = h.authority.signOut();
  assert.equal(h.authority.get(), null);
  release.resolve(); await logout; await rejected;
  assert.equal(h.stored(), null);
  assert.equal(h.discarded[0].accessToken, 'A2');
});

test('logout does not wait for an outstanding refresh before clearing local credentials', async () => {
  const response = deferred<Session>(); const started = deferred<void>();
  const h = harness(async <T>() => { started.resolve(); return await response.promise as T; });
  await h.authority.restore();
  const refreshing = h.authority.refresh(); const rejected = assert.rejects(refreshing, SessionChangedError);
  await started.promise;
  await h.authority.signOut();
  assert.equal(h.stored(), null);
  response.resolve(session('A', 'rotated-after-logout'));
  await rejected;
  assert.equal(h.authority.get(), null);
  assert.equal(h.discarded.length, 1);
});

test('refresh is single-flight and old leases stay invalid after switching away and back', async () => {
  const h = harness(); await h.authority.restore();
  const lease = h.authority.capture();
  const first = h.authority.refresh(); const second = h.authority.refresh();
  assert.equal(first, second); await first;
  assert.equal(h.requests.filter((path) => path.endsWith('/refresh')).length, 1);
  assert.ok(lease.current());
  await h.authority.switchOrganization('B'); await h.authority.switchOrganization('A');
  assert.equal(lease.current(), false);
});

test('normal expiry refreshes and retries using the same organization only', async () => {
  const h = harness(); await h.authority.restore();
  const tokens: string[] = [];
  const read: typeof api = async <T>(_path: string, init?: RequestInit & { token?: string }) => {
    tokens.push(init?.token ?? '');
    if (tokens.length === 1) throw new ApiError('Expired', 401, 'ACCESS_TOKEN_EXPIRED');
    return { ok: true } as T;
  };
  assert.deepEqual(await authenticatedRequest(h.authority, h.authority.capture(), '/v2/test', {}, read), { ok: true });
  assert.deepEqual(tokens, ['A', 'A2']);
});

test('a login response arriving after logout cannot sign the user back in', async () => {
  const response = deferred<Session>(); const started = deferred<void>();
  const h = harness(async <T>() => { started.resolve(); return await response.promise as T; });
  const login = h.authority.login('test@example.invalid', 'synthetic');
  const rejected = assert.rejects(login, SessionChangedError); await started.promise;
  await h.authority.signOut(); response.resolve(session()); await rejected;
  assert.equal(h.authority.get(), null);
  assert.equal(h.stored(), null);
});

test('terminal authentication failure invalidates locally without waiting for push queue retirement', async () => {
  const retirement = deferred<void>(); let retiring = false;
  const authority = new SessionAuthority({
    read: async () => { throw new ApiError('Revoked', 401); },
    restore: async () => JSON.stringify(session()), save: async () => {}, changed: () => {}, challenge: () => {},
    retire: async () => { retiring = true; await retirement.promise; }, discard: async () => {},
  });
  await authority.restore();
  const read: typeof api = async () => { throw new ApiError('Expired', 401, 'ACCESS_TOKEN_EXPIRED'); };
  await assert.rejects(authenticatedRequest(authority, authority.capture(), '/v2/push/devices', { method: 'PUT' }, read), /Revoked/);
  assert.equal(authority.get(), null); assert.ok(retiring);
  retirement.resolve();
});

test('an expired organization switch refreshes inside the mutation queue without deadlocking', async () => {
  const tokens: string[] = []; const refreshes: string[] = [];
  const h = harness(async <T>(path: string, init?: RequestInit & { token?: string }) => {
    if (path.endsWith('/refresh')) { refreshes.push(path); return session('A', 'A2') as T; }
    tokens.push(init?.token ?? '');
    if (tokens.length === 1) throw new ApiError('Expired', 401, 'ACCESS_TOKEN_EXPIRED');
    assert.equal(JSON.parse(String(init?.body)).refreshToken, 'r-A2');
    return session('B') as T;
  });
  await h.authority.restore(); await h.authority.switchOrganization('B');
  assert.deepEqual(tokens, ['A', 'A2']); assert.equal(refreshes.length, 1);
  assert.equal(h.authority.get()?.tenantId, 'B');
});

test('an MFA response arriving after logout cannot restore authentication', async () => {
  const started = deferred<void>(); const response = deferred<Session>();
  const h = harness(async <T>(path: string) => {
    if (path.endsWith('/login')) return { mfaRequired: true, mfaChallengeToken: 'synthetic' } as T;
    started.resolve(); return await response.promise as T;
  });
  await h.authority.login('test@example.invalid', 'synthetic');
  const verifying = h.authority.verify('123456'); const rejected = assert.rejects(verifying, SessionChangedError);
  await started.promise; await h.authority.signOut(); response.resolve(session()); await rejected;
  assert.equal(h.authority.get(), null); assert.equal(h.stored(), null);
});
