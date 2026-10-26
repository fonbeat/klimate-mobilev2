import assert from 'node:assert/strict';
import test from 'node:test';
import { PushLifecycle, singleFlightInstallation, type PendingPushRemoval } from './push-lifecycle.ts';
import type { Session } from './types.ts';

const owner = { user: { ID: 'u' }, tenantId: 'A', accessToken: 'A', refreshToken: 'rA' } as Session;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test('concurrent installation-ID creation writes only one ID', async () => {
  let saved: string | null = null; let created = 0; let writes = 0;
  const installation = singleFlightInstallation(async () => saved, async (id) => { writes++; saved = id; }, () => `id-${++created}`);
  assert.deepEqual(await Promise.all([installation(), installation(), installation()]), ['id-1', 'id-1', 'id-1']);
  assert.equal(writes, 1); assert.equal(created, 1);
});

test('logout prevents registration after native token preparation finishes', async () => {
  const token = deferred<string>(); const started = deferred<void>(); let puts = 0;
  const lifecycle = new PushLifecycle({ installation: async () => 'phone', load: async () => [], save: async () => {}, remove: async () => {} });
  lifecycle.activate(owner);
  const registration = lifecycle.register(lifecycle.capture(), async () => { started.resolve(); return token.promise; }, async () => { puts++; });
  await started.promise; lifecycle.activate(null);
  const retirement = lifecycle.retire(owner);
  token.resolve('ExpoPushToken[synthetic]');
  assert.equal(await registration, false); await retirement;
  assert.equal(puts, 0);
});

test('an in-flight PUT is followed by old-owner DELETE before any new-owner PUT', async () => {
  const started = deferred<void>(); const release = deferred<void>(); const events: string[] = [];
  let pending: PendingPushRemoval[] = [];
  const lifecycle = new PushLifecycle({ installation: async () => 'phone', load: async () => pending, save: async (next) => { pending = next; }, remove: async (session) => { events.push(`DELETE-${session.user.ID}`); } });
  lifecycle.activate(owner);
  const first = lifecycle.register(lifecycle.capture(), async () => 'token', async () => { events.push('PUT-u-start'); started.resolve(); await release.promise; events.push('PUT-u-finish'); });
  await started.promise;
  lifecycle.activate(null); const retirement = lifecycle.retire(owner);
  lifecycle.activate({ ...owner, user: { ...owner.user, ID: 'new' } });
  const second = lifecycle.register(lifecycle.capture(), async () => 'token', async () => { events.push('PUT-new'); });
  release.resolve(); await first; await retirement; await second;
  assert.deepEqual(events, ['PUT-u-start', 'PUT-u-finish', 'DELETE-u', 'PUT-new']);
  assert.deepEqual(pending, []);
});

test('failed removal is retained without credentials and retried before the same owner registers again', async () => {
  let pending: PendingPushRemoval[] = []; let offline = true; const events: string[] = [];
  const lifecycle = new PushLifecycle({ installation: async () => 'phone', load: async () => pending, save: async (next) => { pending = next; }, remove: async () => { events.push('DELETE'); if (offline) throw new Error('Offline'); } });
  await assert.rejects(lifecycle.retire(owner), /Offline/);
  assert.deepEqual(pending, [{ scope: 'u:A', installationId: 'phone' }]);
  assert.equal(JSON.stringify(pending).includes('refreshToken'), false);
  offline = false; lifecycle.activate(owner);
  await lifecycle.register(lifecycle.capture(), async () => 'token', async () => { events.push('PUT'); });
  assert.deepEqual(events, ['DELETE', 'DELETE', 'DELETE', 'PUT']);
  assert.deepEqual(pending, []);
});

test('pending cleanup for another organization is never retried with the current organization token', async () => {
  const removals: string[] = [];
  let pending = [{ scope: 'u:A', installationId: 'phone' }];
  const lifecycle = new PushLifecycle({ installation: async () => 'phone', load: async () => pending, save: async (next) => { pending = next; }, remove: async (session) => { removals.push(session.tenantId!); } });
  lifecycle.activate({ ...owner, tenantId: 'B' });
  await lifecycle.register(lifecycle.capture(), async () => 'token', async () => {});
  assert.deepEqual(removals, []);
  assert.deepEqual(pending, []);
});

test('logout cleanup intent is durable before an old PUT finishes', async () => {
  const started = deferred<void>(); const release = deferred<void>(); const saved = deferred<void>();
  let pending: PendingPushRemoval[] = [];
  const lifecycle = new PushLifecycle({ installation: async () => 'phone', load: async () => pending, save: async (next) => { pending = next; if (next.length) saved.resolve(); }, remove: async () => {} });
  lifecycle.activate(owner);
  const registration = lifecycle.register(lifecycle.capture(), async () => 'token', async () => { started.resolve(); await release.promise; });
  await started.promise; lifecycle.activate(null);
  const retirement = lifecycle.retire(owner);
  await saved.promise;
  assert.deepEqual(pending, [{ scope: 'u:A', installationId: 'phone' }]);
  release.resolve(); await registration; await retirement;
  assert.deepEqual(pending, []);
});

test('a native token call that never returns cannot hold the logout queue indefinitely', async () => {
  let removed = false;
  const started = deferred<void>();
  const lifecycle = new PushLifecycle({ prepareTimeoutMs: 5, installation: async () => 'phone', load: async () => [], save: async () => {}, remove: async () => { removed = true; } });
  lifecycle.activate(owner);
  const registration = lifecycle.register(lifecycle.capture(), () => { started.resolve(); return new Promise(() => {}); }, async () => {});
  const rejected = assert.rejects(registration, /timed out/);
  await started.promise;
  lifecycle.activate(null);
  await lifecycle.retire(owner);
  await rejected; assert.ok(removed);
});
