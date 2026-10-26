import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError, parseApiBody, retryDelay, unwrapApiPayload } from './api.ts';

test('parses and unwraps the V2 data envelope', () => {
  const payload = parseApiBody('{"data":{"total":4}}');
  assert.deepEqual(unwrapApiPayload(payload), { total: 4 });
});

test('coalesces identical GETs while keeping organization tokens and completed requests separate', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  const finish: (() => void)[] = [];
  globalThis.fetch = async () => { calls++; await new Promise<void>((resolve) => finish.push(resolve)); return new Response('{"total":2}'); };
  const first = api('/v2/test-read', { token: 'tenant-a' });
  const same = api('/v2/test-read', { token: 'tenant-a' });
  const other = api('/v2/test-read', { token: 'tenant-b' });
  assert.equal(first, same);
  assert.notEqual(first, other);
  assert.equal(calls, 2);
  finish.splice(0).forEach((resolve) => resolve());
  await Promise.all([first, same, other]);
  const next = api('/v2/test-read', { token: 'tenant-a' });
  assert.equal(calls, 3);
  finish.splice(0).forEach((resolve) => resolve());
  await next;
});

test('reads retry rate limiting once and preserve actionable module-disabled errors', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }) : new Response('{"total":1}');
  assert.deepEqual(await api('/v2/test-rate'), { total: 1 });
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }); };
  await assert.rejects(api('/v2/test-bounded'), (error: unknown) => error instanceof ApiError && error.status === 429);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(api('/v2/test-write', { method: 'PATCH', body: '{}' }));
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response('{"code":"MODULE_DISABLED"}', { status: 403 });
  await assert.rejects(api('/v2/status/services'), (error: unknown) => error instanceof ApiError && error.code === 'MODULE_DISABLED' && error.message.includes('not enabled'));
  assert.equal(retryDelay('3'), 3000);
  assert.equal(retryDelay('Thu, 15 Oct 2026 12:00:03 GMT', Date.parse('2026-10-15T12:00:00Z')), 3000);
});

test('preserves unwrapped payloads and readable non-JSON errors', () => {
  assert.deepEqual(unwrapApiPayload(parseApiBody('{"total":2}')), { total: 2 });
  assert.deepEqual(parseApiBody('  upstream unavailable  '), { message: 'upstream unavailable' });
  assert.deepEqual(parseApiBody(''), {});
});

test('successful but malformed responses never reach screens as typed data', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const raw of ['<html>Sign in</html>', '', 'null', '{"data":null}', '{"total":2}', '{"records":[{}],"total":1}']) {
    globalThis.fetch = async () => new Response(raw);
    await assert.rejects(api('/v2/status/monitors'), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  }
  globalThis.fetch = async () => new Response(null, { status: 204 });
  await assert.rejects(api('/v2/status/monitors'), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  globalThis.fetch = async () => new Response('{"data":{"records":[],"total":0}}');
  assert.deepEqual(await api('/v2/status/monitors'), { records: [], total: 0 });
});

test('a completed read-state mutation allows a fresh GET even when an older GET is still in flight', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let finishOld!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = async (_input, options) => {
    if (options?.method === 'PATCH') return new Response(null, { status: 204 });
    calls++;
    if (calls === 1) return new Promise<Response>((resolve) => { finishOld = resolve; });
    return new Response('{"unread":0}');
  };
  const old = api('/v2/notifications-test', { token: 'user' });
  await api('/v2/notifications-test/read', { method: 'PATCH', token: 'user', body: '{}' });
  assert.deepEqual(await api('/v2/notifications-test', { token: 'user' }), { unread: 0 });
  assert.equal(calls, 2);
  finishOld(new Response('{"unread":1}'));
  await old;
});
