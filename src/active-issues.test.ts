import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from './api.ts';
import { offlineGatewaysPath } from './live-status.ts';
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

  const initial = await readActiveIssues(activeIssuesPath, legacyRead(read));
  assert.equal(initial.down.at(-1)?.ID, 'monitor-100');
  assert.equal(initial.count, 102);
  assert.deepEqual(initial.attention, []);

  down = down.slice(1, -1);
  offline = [];
  const updated = await readActiveIssues(activeIssuesPath, legacyRead(read));
  assert.equal(updated.count, 100);
  assert.ok(updated.down.every((monitor) => monitor.ID !== 'monitor-100'));
  assert.deepEqual(updated.attention.map((monitor) => monitor.ID), ['monitor-0']);
  assert.deepEqual(updated.offline, []);
});

test('an incomplete feed cannot replace the shared issue list and count', async () => {
  const read = async <T>(path: string): Promise<T> => {
    if (path === offlineGatewaysPath(0, 100)) return { probes: [], total: 1 } as T;
    return { records: [], total: 0 } as T;
  };
  await assert.rejects(readActiveIssues(activeIssuesPath, legacyRead(read)), /incomplete active issue list/);
});

test('a recovery during pagination triggers a fresh read of the affected feed', async () => {
  const monitors = Array.from({ length: 101 }, (_, index) => ({ ID: `monitor-${index}`, status: 'Down' }));
  const downOffsets: number[] = [];
  const read = async <T>(path: string): Promise<T> => {
    const params = new URL(path, 'https://example.invalid').searchParams;
    if (path === offlineGatewaysPath(0, 100)) return { probes: [], total: 0 } as T;
    if (params.get('status') === 'attention') return { records: [], total: 0 } as T;
    const offset = Number(params.get('offset'));
    downOffsets.push(offset);
    if (downOffsets.length === 1) return { records: monitors.slice(0, 100), total: 101 } as T;
    const afterRecovery = monitors.slice(1);
    return { records: afterRecovery.slice(offset), total: 100 } as T;
  };
  const result = await readActiveIssues(activeIssuesPath, legacyRead(read));
  assert.deepEqual(downOffsets, [0, 100, 0]);
  assert.equal(result.count, 100);
  assert.equal(result.down[0]?.ID, 'monitor-1');
});

function legacyRead(read: Parameters<typeof readActiveIssues>[1]): Parameters<typeof readActiveIssues>[1] {
  return (path) => {
    if (path === activeIssuesPath) return Promise.reject(new ApiError('Not found', 404));
    return read(path);
  };
}

test('a shared active issues snapshot supplies the bell total across pages', async () => {
  const paths: string[] = [];
  const result = await readActiveIssues(activeIssuesPath, async <T>(path: string) => {
    paths.push(path);
    if (path === activeIssuesPath) {
      return { total: 2, records: [{ monitor: { ID: 'monitor-1', status: 'Down' } }], nextCursor: 'frozen.1' } as T;
    }
    return { total: 2, records: [{ gateway: { id: 'gateway-1', status: 'offline' } }] } as T;
  });
  assert.deepEqual(paths, [activeIssuesPath, activeIssuesPath + '?cursor=frozen.1']);
  assert.equal(result.count, 2);
  assert.equal(result.down[0]?.ID, 'monitor-1');
  assert.equal(result.offline[0]?.id, 'gateway-1');
});

test('an expired snapshot restarts at the first page', async () => {
  let firstPages = 0;
  const result = await readActiveIssues(activeIssuesPath, async <T>(path: string) => {
    if (path !== activeIssuesPath) throw new ApiError('Expired', 409, 'ISSUES_SNAPSHOT_EXPIRED');
    firstPages++;
    if (firstPages === 1) return { total: 2, records: [{ monitor: { ID: 'old', status: 'Down' } }], nextCursor: 'old' } as T;
    return { total: 0, records: [] } as T;
  });
  assert.equal(firstPages, 2);
  assert.equal(result.count, 0);
});
