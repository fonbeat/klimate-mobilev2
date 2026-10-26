import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureOutagePushEnabled, phonePermissionLabel } from './push-alert-policy.ts';

test('mobile enables both outage push types only when needed, without disabling either', async () => {
  for (const preferences of [
    { monitorDown: false, probeOffline: false },
    { monitorDown: true, probeOffline: false },
    { monitorDown: false, probeOffline: true },
  ]) {
    const writes: unknown[] = [];
    assert.equal(await ensureOutagePushEnabled(async () => preferences, async (value) => { writes.push(value); }), true);
    assert.deepEqual(writes, [{ monitorDown: true, probeOffline: true }]);
  }
  let writes = 0;
  await ensureOutagePushEnabled(async () => ({ monitorDown: true, probeOffline: true }), async () => { writes++; });
  assert.equal(writes, 0);
});

test('failed preference reads/writes and changed sessions do not report push readiness', async () => {
  let writes = 0;
  const save = async () => { writes++; };
  const read = async () => ({ monitorDown: false, probeOffline: false });
  assert.equal(await ensureOutagePushEnabled(read, save, () => false), false);
  assert.equal(writes, 0);
  await assert.rejects(ensureOutagePushEnabled(async () => { throw new Error('offline'); }, save), /offline/);
  assert.equal(writes, 0);
  await assert.rejects(ensureOutagePushEnabled(read, async () => { throw new Error('save failed'); }), /save failed/);
});

test('permission labels describe phone permission without promising push delivery', () => {
  assert.equal(phonePermissionLabel('allowed'), 'Notifications allowed');
  assert.equal(phonePermissionLabel('blocked'), 'Notifications blocked');
  assert.equal(phonePermissionLabel('quiet'), 'Quiet notifications allowed');
  assert.equal(phonePermissionLabel('notRequested'), 'Permission not yet requested');
  assert.equal(phonePermissionLabel('unavailable'), 'Notifications unavailable on this device');
});
