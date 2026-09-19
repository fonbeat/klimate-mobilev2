import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveScreenState } from './screen-state.ts';
import { getOverviewHealth } from './status.ts';

test('prioritizes loading, error, empty, and content screen states consistently', () => {
  assert.equal(resolveScreenState({ loading: true, error: 'offline', empty: 'none' }), 'loading');
  assert.equal(resolveScreenState({ error: 'offline', empty: 'none' }), 'error');
  assert.equal(resolveScreenState({ empty: 'none' }), 'empty');
  assert.equal(resolveScreenState({}), 'content');
});

test('does not claim a completely unconfigured environment is 100% operational', () => {
  assert.deepEqual(getOverviewHealth({ totalMonitors: 0, upMonitors: 0, downMonitors: 0, attentionMonitors: 0 }), {
    kind: 'no-data', percentage: null, label: 'No monitoring data',
  });
});

test('marks down or attention monitors as an affected overview', () => {
  assert.deepEqual(getOverviewHealth({ totalMonitors: 10, upMonitors: 8, downMonitors: 1, attentionMonitors: 1 }), {
    kind: 'affected', percentage: 80, label: '80% operational',
  });
});

test('marks a fully up environment as healthy', () => {
  assert.deepEqual(getOverviewHealth({ totalMonitors: 5, upMonitors: 5, downMonitors: 0, attentionMonitors: 0 }), {
    kind: 'healthy', percentage: 100, label: '100% operational',
  });
});
