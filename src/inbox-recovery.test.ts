import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRecoveries, inboxItems, isRecovered, outstandingUnread, readUnreadInbox, recoveryStorageKey, type InboxRead, type RecoveryLedger } from './inbox-recovery.ts';
import type { NotificationInboxItem } from './types.ts';

const now = Date.parse('2026-10-26T12:00:00Z');
const alert = (id: string, resourceId = 'm1', createdAt = '2026-10-26T11:00:00Z'): NotificationInboxItem => ({ id, resourceId, createdAt, eventType: 'monitor_down', resourceType: 'monitor', title: 'Monitor down', body: 'Office is down', read: false });
const gateway = { ...alert('g1'), resourceId: 'g1', eventType: 'probe_offline', resourceType: 'probe' } as NotificationInboxItem;
function fixture(responses: Record<string, unknown>, saved: Record<string, string> = {}) {
  const paths: string[] = [];
  const writes: string[] = [];
  const read: InboxRead = async <T>(path: string) => {
    paths.push(path);
    const response = responses[path];
    if (response instanceof Error) throw response;
    if (!response) throw new Error(`Unexpected request ${path}`);
    return response as T;
  };
  return { paths, writes, options: { now, read, current: () => true, load: async (key: string) => saved[key] ?? null, save: async (key: string, value: string) => { writes.push(key); saved[key] = value; } } };
}
const monitorPath = '/v2/monitors/m1/uptime?window=1h';

test('confirmed monitor and Gateway recovery clears unread counts but preserves original messages and read state', async () => {
  const monitor = alert('m1');
  const f = fixture({ [monitorPath]: { status: 'Up', generatedAt: new Date(now).toISOString() }, '/v2/gateways/g1': { status: 'online', lastSeenAt: new Date(now - 5000).toISOString() } });
  const ledger = (await checkRecoveries([monitor, gateway], {}, f.options))!;
  assert.ok(isRecovered(monitor, ledger));
  assert.ok(isRecovered(gateway, ledger));
  assert.equal(outstandingUnread(2, [monitor, gateway], ledger), 0);
  assert.equal(monitor.read, false);
  assert.equal(monitor.body, 'Office is down');
  assert.equal(f.writes.length, 2);
  assert.ok(f.paths.every((path) => !path.includes('/read')));
});

test('Unknown, Attention, Down, paused and missing resources never imply recovery', async () => {
  for (const status of ['Unknown', 'Attention', 'Down', 'Paused', 'Disabled']) {
    const f = fixture({ [monitorPath]: { status, generatedAt: new Date(now).toISOString() } });
    assert.deepEqual(await checkRecoveries([alert('a')], {}, f.options), {});
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ [monitorPath]: new Error('404 or permission denied') });
  assert.deepEqual(await checkRecoveries([alert('a')], {}, f.options), {});
});

test('stale, malformed and future healthy reports cannot dismiss outage alerts', async () => {
  for (const generatedAt of [undefined, '12:00:00', 'invalid', new Date(now - 600_000).toISOString(), new Date(now + 120_000).toISOString()]) {
    const f = fixture({ [monitorPath]: { status: 'Up', generatedAt } });
    assert.deepEqual(await checkRecoveries([alert('a')], {}, f.options), {});
  }
  const f = fixture({ '/v2/gateways/g1': { status: 'online', lastSeen: 'Just now' } });
  assert.deepEqual(await checkRecoveries([gateway], {}, f.options), {});
});

test('a new outage is not hidden by the recovery of an older outage on the same resource', () => {
  const ledger = { 'monitor:m1': now - 60_000 };
  assert.ok(isRecovered(alert('old'), ledger));
  assert.equal(isRecovered(alert('new', 'm1', new Date(now).toISOString()), ledger), false);
  assert.equal(isRecovered(alert('same-time', 'm1', new Date(now - 60_000).toISOString()), ledger), false);
  assert.equal(outstandingUnread(2, [alert('old'), alert('new', 'm1', new Date(now).toISOString())], ledger), 1);
});

test('recovery survives relaunch and later failure without dismissing the new outage', async () => {
  const saved = { 'monitor:m1': String(now - 60_000) };
  const f = fixture({ [monitorPath]: { status: 'Down', generatedAt: new Date(now).toISOString() } }, saved);
  const ledger = (await checkRecoveries([alert('old'), alert('new', 'm1', new Date(now).toISOString())], {}, f.options))!;
  assert.ok(isRecovered(alert('old'), ledger));
  assert.equal(isRecovered(alert('new', 'm1', new Date(now).toISOString()), ledger), false);
});

test('badge deducts recovered unread IDs once and does not deduct already-read history', () => {
  const a = alert('a');
  const b = { ...alert('b'), read: true };
  assert.equal(outstandingUnread(3, [a, a, b], { 'monitor:m1': now }), 2);
  assert.equal(outstandingUnread(0, [a], { 'monitor:m1': now }), 0);
});

test('All retains recovered history; Unread and badge use the same outstanding-message rule', () => {
  const history = alert('recovered');
  const active = alert('active', 'm2');
  const read = { ...alert('read', 'm2'), read: true };
  const records = [history, active, read];
  const ledger = { 'monitor:m1': now };
  const recovered = (item: NotificationInboxItem) => isRecovered(item, ledger);
  assert.deepEqual(inboxItems(records, false, recovered), records);
  assert.deepEqual(inboxItems(records, true, recovered), [active]);
  assert.equal(outstandingUnread(2, records, ledger), 1);
});

test('storage failure still allows recovery in memory without changing server read state', async () => {
  const f = fixture({ [monitorPath]: { status: 'Up', generatedAt: new Date(now).toISOString() } });
  const ledger = (await checkRecoveries([alert('a')], {}, { ...f.options, load: async () => { throw new Error('Storage unavailable'); }, save: async () => { throw new Error('Storage unavailable'); } }))!;
  assert.ok(isRecovered(alert('a'), ledger));
});

test('recovery storage is isolated by user, organization, resource type and ID', () => {
  const key = recoveryStorageKey('u1:tenant1', 'monitor:m1');
  assert.match(key, /^[\w.-]+$/);
  for (const [scope, resource] of [['u2:tenant1', 'monitor:m1'], ['u1:tenant2', 'monitor:m1'], ['u1:tenant1', 'probe:m1']]) assert.notEqual(recoveryStorageKey(scope, resource), key);
});

test('badge reconciliation includes unread alerts beyond the first page', async () => {
  const records = Array.from({ length: 105 }, (_, i) => alert(`a${i}`));
  const paths: string[] = [];
  const read: InboxRead = async <T>(path: string) => {
    paths.push(path);
    const offset = Number(new URL(`https://local${path}`).searchParams.get('offset'));
    return { records: records.slice(offset, offset + 100), unread: 105, total: 105 } as T;
  };
  const page = (await readUnreadInbox(read, () => true))!;
  assert.equal(page.items.length, 105);
  assert.equal(page.unread, 105);
  assert.equal(paths.length, 2);
  assert.equal(outstandingUnread(page.unread, page.items, { 'monitor:m1': now }), 0);
});

test('scope changes cancel both Inbox pagination and recovery results', async () => {
  let active = true;
  const read: InboxRead = async <T>() => {
    active = false;
    return { records: [alert('a')], unread: 1, total: 1 } as T;
  };
  assert.equal(await readUnreadInbox(read, () => active), undefined);
  active = true;
  const f = fixture({});
  const ledger = await checkRecoveries([alert('a')], {}, { ...f.options, current: () => active, read: async <T>() => { active = false; return { status: 'Up', generatedAt: new Date(now).toISOString() } as T; } });
  assert.equal(ledger, undefined);
  assert.equal(f.writes.length, 0);
});

test('only one health request per unique resource is made and no more than four run at once', async () => {
  let concurrent = 0;
  let peak = 0;
  let calls = 0;
  const items = Array.from({ length: 12 }, (_, i) => alert(`a${i}`, `m${i % 6}`));
  const f = fixture({});
  const read: InboxRead = async <T>() => {
    calls++; peak = Math.max(peak, ++concurrent);
    await new Promise((resolve) => setTimeout(resolve, 1));
    concurrent--;
    return { status: 'Up', generatedAt: new Date(now).toISOString() } as T;
  };
  const ledger = (await checkRecoveries(items, {} as RecoveryLedger, { ...f.options, read }))!;
  assert.equal(calls, 6);
  assert.ok(peak <= 4);
  assert.ok(items.every((item) => isRecovered(item, ledger)));
});

test('repeated or empty pagination responses terminate safely', async () => {
  let calls = 0;
  const read: InboxRead = async <T>() => {
    calls++;
    return { records: [alert('a')], unread: 1000, total: 1000 } as T;
  };
  const page = (await readUnreadInbox(read, () => true))!;
  assert.equal(calls, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.unread, 1000);
});
