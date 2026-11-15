import assert from 'node:assert/strict';
import test from 'node:test';
import { activeIssuesPath, readActiveIssues } from './active-issues.ts';

test('the shared count includes every page and drops recovered rows together', async () => {
  let down = Array.from({ length: 101 }, (_, index) => ({ ID: `monitor-${index}`, status: 'Down' }));
  const attention = [{ ID: 'monitor-0', status: 'Attention' }];
  let offline = [{ id: 'gateway-1' }];
  const read = async <T>(path: string): Promise<T> => {
    const { pathname, searchParams } = new URL(path, 'https://example.invalid');
    const offset = Number(searchParams.get('offset'));
    const limit = Number(searchParams.get('limit'));
    if (pathname === '/v2/gateways') return { probes: offline.slice(offset, offset + limit), total: offline.length } as T;
    const rows = searchParams.get('status') === 'down' ? down : attention;
    return { records: rows.slice(offset, offset + limit), total: rows.length } as T;
  };

  const initial = await readActiveIssues(activeIssuesPath, read);
  assert.equal(initial.down.at(-1)?.ID, 'monitor-100');
  assert.equal(initial.count, 102);
  assert.deepEqual(initial.attention, []);

  down = down.slice(1, -1);
  offline = [];
  const updated = await readActiveIssues(activeIssuesPath, read);
  assert.equal(updated.count, 100);
  assert.ok(updated.down.every((monitor) => monitor.ID !== 'monitor-100'));
  assert.deepEqual(updated.attention.map((monitor) => monitor.ID), ['monitor-0']);
  assert.deepEqual(updated.offline, []);
});

test('an incomplete feed cannot replace the shared issue list and count', async () => {
  const read = async <T>(path: string): Promise<T> => {
    if (path === activeIssuesPath) return { probes: [], total: 1 } as T;
    return { records: [], total: 0 } as T;
  };
  await assert.rejects(readActiveIssues(activeIssuesPath, read), /incomplete active issue list/);
});
