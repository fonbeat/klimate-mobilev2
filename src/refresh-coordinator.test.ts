import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefreshCoordinator } from './refresh-coordinator.ts';

test('shares one refresh operation between concurrent callers', async () => {
  const coordinator = createRefreshCoordinator<string>();
  let calls = 0;
  let finish!: (value: string) => void;
  const operation = () => {
    calls += 1;
    return new Promise<string>((resolve) => { finish = resolve; });
  };
  const first = coordinator.run(operation);
  const second = coordinator.run(operation);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish('new-session');
  assert.deepEqual(await Promise.all([first, second]), ['new-session', 'new-session']);
});

test('allows a later refresh after a failed operation', async () => {
  const coordinator = createRefreshCoordinator<string>();
  await assert.rejects(coordinator.run(async () => { throw new Error('expired'); }), /expired/);
  assert.equal(await coordinator.run(async () => 'recovered'), 'recovered');
});
