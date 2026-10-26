import assert from 'node:assert/strict';
import test from 'node:test';
import { readPageRange } from './read-page-range.ts';

test('refreshes the whole loaded range in backend order and respects a shrinking total', async () => {
  const values = ['z', 'b', 'a', 'x', 'c'];
  const offsets: number[] = [];
  const result = await readPageRange({ offset: 0, pageSize: 2, wanted: 6, read: async (offset, limit) => { offsets.push(offset); return { records: values.slice(offset, offset + limit), total: values.length }; }, items: (page) => page.records, total: (page) => page.total, current: () => true });
  assert.deepEqual(result, { records: values, total: 5 });
  assert.deepEqual(offsets, [0, 2, 4]);
});

test('discards an old organization/filter result before publishing its rows or unread count', async () => {
  let current = true;
  let updates = 0;
  const result = await readPageRange({ offset: 0, pageSize: 2, wanted: 2, read: async () => { current = false; return { records: ['old tenant'], total: 1 }; }, items: (page) => page.records, total: (page) => page.total, current: () => current, onPage: () => { updates++; } });
  assert.equal(result, null);
  assert.equal(updates, 0);
});

test('stops on an empty page instead of polling forever when the server total changes', async () => {
  let calls = 0;
  const result = await readPageRange({ offset: 0, pageSize: 2, wanted: 6, read: async () => { calls++; return { records: [] as string[], total: 20 }; }, items: (page) => page.records, total: (page) => page.total, current: () => true });
  assert.equal(calls, 1);
  assert.deepEqual(result?.records, []);
});
