import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentTab, tabForSwipe } from './swipe-tabs-routing.ts';

test('swipes follow the visual tab order and stop at either edge', () => {
  assert.equal(adjacentTab('overview', 'left'), 'status');
  assert.equal(adjacentTab('status', 'left'), 'incidents');
  assert.equal(adjacentTab('incidents', 'right'), 'status');
  assert.equal(adjacentTab('more', 'left'), null);
  assert.equal(adjacentTab('overview', 'right'), null);
});

test('short or mostly vertical movement does not change tabs', () => {
  assert.equal(tabForSwipe('status', -50, 0), null);
  assert.equal(tabForSwipe('status', -90, 80), null);
  assert.equal(tabForSwipe('status', -90, 20), 'incidents');
});
