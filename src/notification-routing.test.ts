import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationDestination } from './notification-routing.ts';

test('routes monitor-down pushes to incidents', () => {
  assert.equal(notificationDestination({ type: 'monitor_down' }), '/(tabs)/incidents');
});

test('routes probe-offline pushes directly to the probes section', () => {
  assert.deepEqual(notificationDestination({ type: 'probe_offline' }), {
    pathname: '/(tabs)/more', params: { section: 'probes' },
  });
});

test('ignores unsupported notification events', () => {
  assert.equal(notificationDestination({ type: 'marketing' }), null);
});
