import assert from 'node:assert/strict';
import test from 'node:test';
import { appendPage, refreshOffsets, mergeRefreshedPage } from './page-refresh.ts';

test('polling stays bounded after thousands of loaded items', () => {
  assert.deepEqual(refreshOffsets([955, 956, 980], 1000, 24), [0, 936, 960]);
  assert.deepEqual(refreshOffsets([], 1000, 24), [0]);
});
test('refresh updates visible health without mixing reordered snapshots', () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ id: String(index), status: 'up' }));
  const page = rows.slice(48, 72).map((row) => ({ ...row, status: 'down' }));
  const next = mergeRefreshedPage(rows, page, 48, 100, 100, 24)!;
  assert.equal(next.length, 100);
  assert.equal(next[48].status, 'down');
  assert.equal(rows[48].status, 'up');
  assert.equal(mergeRefreshedPage(rows, [...page].reverse(), 48, 100, 100, 24), null);
  assert.equal(mergeRefreshedPage(rows, page, 48, 101, 100, 24), null);
});

test('a shifted load-more boundary requests a reset and can append after restarting', () => {
  const first = [{ id: 'one' }, { id: 'two' }];
  const shifted = [{ id: 'two' }, { id: 'three' }];
  assert.equal(appendPage(first, shifted, 4, 4), null);
  assert.equal(appendPage(first, [{ id: 'three' }], 3, 4), null);
  const fresh = [{ id: 'new' }, { id: 'one' }];
  assert.deepEqual(appendPage(fresh, shifted, 4, 4), [...fresh, ...shifted]);
});
