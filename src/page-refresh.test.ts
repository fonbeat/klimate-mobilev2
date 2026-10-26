import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshOffsets, mergeRefreshedPage } from './page-refresh.ts';

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
