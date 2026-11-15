import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from './api.ts';
import { overviewPath, readOverview } from './overview-reader.ts';

const lastUpdated = '2026-11-15T10:00:00Z';
const down = { ID: 'a', monitorID: 'a', type: 'CLOUD', label: 'Cloud check', host: 'example.invalid', status: 'Down' };
const attention = { ID: 'b', monitorID: 'b', type: 'PING', label: 'Gateway health', host: 'example.invalid', status: 'Attention' };
const v3 = { lastUpdated, summary: { total: 5, Up: 2, Down: 1, Attention: 1, Unknown: 1 }, records: [{ wallboard: down }, { wallboard: attention }] };

test('one V3 read supplies monitor counts and protocol-aware affected cards', async () => {
  const calls: string[] = [];
  const result = await readOverview(overviewPath, async <T>(path: string) => { calls.push(path); return v3 as T; });
  assert.deepEqual(calls, [overviewPath]);
  assert.deepEqual(result.counts, { total: 5, healthy: 2, down: 1, attention: 1, unknown: 1 });
  assert.deepEqual(result.issues.map((issue) => issue.id), ['a', 'b']);
  assert.equal(result.issues[0].reportPath, '/v3/cloudMonitors/a/report');
});

test('missing V3 support uses the existing monitor feed and fetches only the needed cards', async () => {
  const calls: string[] = [];
  const result = await readOverview(overviewPath, async <T>(path: string) => {
    calls.push(path);
    if (path === overviewPath) throw new ApiError('Not found', 404);
    const summary = { lastUpdated, totalMonitors: 5, upMonitors: 2, downMonitors: 1, attentionMonitors: 1, unknownMonitors: 1 };
    return { total: 1, summary, records: path.endsWith('=down') ? [down] : [attention] } as T;
  });
  assert.deepEqual(calls, [overviewPath, '/v2/status/monitors?offset=0&limit=3&status=down', '/v2/status/monitors?offset=0&limit=2&status=attention']);
  assert.deepEqual(result.issues.map((issue) => issue.id), ['a', 'b']);
});

test('auth and transient failures propagate without a second status request', async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    await assert.rejects(readOverview(overviewPath, async () => { calls++; throw new ApiError('Request failed', status); }), { status });
    assert.equal(calls, 1);
  }
});
