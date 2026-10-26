import assert from 'node:assert/strict';
import test from 'node:test';
import { InboxHealthCache, UnreadInboxCache } from './inbox-refresh-cache.ts';
import type { InboxRead } from './inbox-recovery.ts';
import type { NotificationInboxItem } from './types.ts';

const item = (id: string): NotificationInboxItem => ({ id, eventType: 'monitor_down', resourceType: 'monitor', resourceId: 'monitor', title: '', body: '', createdAt: '2026-10-26T10:00:00Z', read: false });
function feed(count = 205) {
  let items = Array.from({ length: count }, (_, i) => item(`a${count - i}`));
  const calls: number[] = [];
  const read: InboxRead = async <T>(path: string) => {
    const offset = Number(new URL(`https://local${path}`).searchParams.get('offset'));
    calls.push(offset);
    return { records: items.slice(offset, offset + 100), unread: items.length, total: items.length } as T;
  };
  return { calls, read, set: (next: NotificationInboxItem[]) => { items = next; }, get: () => items };
}

test('unchanged unread history reads only the newest page after initial reconciliation', async () => {
  const f = feed(); const cache = new UnreadInboxCache();
  assert.equal((await cache.read(f.read, () => true))?.items.length, 205);
  assert.deepEqual(f.calls, [0, 100, 200]);
  f.calls.length = 0;
  assert.equal((await cache.read(f.read, () => true))?.items.length, 205);
  assert.deepEqual(f.calls, [0]);
});

test('new arrivals merge with the verified tail without re-reading all history', async () => {
  const f = feed(); const cache = new UnreadInboxCache();
  await cache.read(f.read, () => true); f.calls.length = 0;
  f.set([item('new'), ...f.get()]);
  const page = (await cache.read(f.read, () => true))!;
  assert.equal(page.unread, 206); assert.equal(page.items[0].id, 'new');
  assert.equal(page.items.length, 206); assert.deepEqual(f.calls, [0]);
});

test('external reads, forced refresh and cache expiry trigger complete reconciliation', async () => {
  const f = feed(); let now = 0; const cache = new UnreadInboxCache(() => now);
  await cache.read(f.read, () => true); f.calls.length = 0;
  f.set(f.get().filter((row) => row.id !== 'a1'));
  assert.equal((await cache.read(f.read, () => true))?.unread, 204);
  assert.deepEqual(f.calls, [0, 100, 200]); f.calls.length = 0;
  await cache.read(f.read, () => true, true); assert.deepEqual(f.calls, [0, 100, 200]);
  f.calls.length = 0; now = 120_001;
  await cache.read(f.read, () => true); assert.deepEqual(f.calls, [0, 100, 200]);
});

test('simultaneous new arrivals and external reads cannot hide changed history', async () => {
  const f = feed(); const cache = new UnreadInboxCache();
  await cache.read(f.read, () => true); f.calls.length = 0;
  f.set([item('new'), ...f.get().slice(0, -1)]);
  const page = (await cache.read(f.read, () => true))!;
  assert.equal(page.items[0].id, 'new');
  assert.equal(page.items.some((row) => row.id === 'a1'), false);
  assert.deepEqual(f.calls, [0, 100, 200]);
});

test('local read-state updates keep the cached count and tail consistent', async () => {
  const f = feed(); const cache = new UnreadInboxCache();
  await cache.read(f.read, () => true); f.calls.length = 0;
  cache.recordRead('a1'); f.set(f.get().filter((row) => row.id !== 'a1'));
  const page = (await cache.read(f.read, () => true))!;
  assert.equal(page.unread, 204); assert.equal(page.items.length, 204);
  assert.deepEqual(f.calls, [0]);
});

test('cancelled scope results never populate the unread cache', async () => {
  const f = feed(); const cache = new UnreadInboxCache();
  assert.equal(await cache.read(f.read, () => false), undefined);
  f.calls.length = 0;
  await cache.read(f.read, () => true);
  assert.deepEqual(f.calls, [0, 100, 200]);
});

test('page inspection and badge reconciliation share resource reads and expire them', async () => {
  let now = 0; let reads = 0; let loads = 0;
  const cache = new InboxHealthCache(() => now);
  const read: InboxRead = async <T>() => { reads++; return { status: 'Down' } as T; };
  await Promise.all([cache.read('/resource', read), cache.read('/resource', read)]);
  await cache.read('/resource', read); assert.equal(reads, 1);
  await cache.load('key', async () => { loads++; return null; });
  await cache.load('key', async () => { loads++; return null; }); assert.equal(loads, 1);
  now = 30_001; await cache.read('/resource', read); assert.equal(reads, 2);
  cache.clear(); await cache.read('/resource', read); assert.equal(reads, 3);
});

test('resource errors are retained only for a short retry backoff and never converted to health', async () => {
  let now = 0; let calls = 0; const cache = new InboxHealthCache(() => now);
  const read: InboxRead = async () => { calls++; throw new Error('Offline'); };
  await assert.rejects(cache.read('/resource', read), /Offline/);
  await assert.rejects(cache.read('/resource', read), /Offline/); assert.equal(calls, 1);
  now = 5001; await assert.rejects(cache.read('/resource', read), /Offline/); assert.equal(calls, 2);
});
