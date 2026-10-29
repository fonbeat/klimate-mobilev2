import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from './api.ts';
import { validReportPath, canonicalReportPath, monitorReportPath } from './report-routing.ts';
import { monitorCard } from './live-status.ts';
import { incidentResourceLabel } from './incident-presentation.ts';
import { monitorRecoveryEvidence, readStatusReport, type ReportRead } from './status-report-reader.ts';
import { validResponse } from './response-validation.ts';
import { cloudResponse, databaseFresh, databaseValue, databaseMetricName, type CloudReport, type DatabaseReport } from './new-monitor-reports.ts';
import { checkRecoveries } from './inbox-recovery.ts';
import type { Monitor, NotificationInboxItem } from './types.ts';

const now = Date.parse('2026-10-29T12:00:00Z');
const at = new Date(now).toISOString();
const cloudPath = '/v3/cloudMonitors/c1/report';
const databasePath = '/v3/databaseMonitors/d1/report';
function cloud(): CloudReport {
  const latest = { id: 'run1', locationId: 'l1', state: 'Up', scheduledAt: at, completedAt: at, totalMs: 120, statusCode: 200 };
  return { monitor: { id: 'c1', name: 'Cloud website', enabled: true, config: { url: 'https://example.invalid/health', method: 'GET', locationIds: ['l1'] } }, targetName: 'Website', collectionEnabled: true, generatedAt: at, summary: { state: 'Up', healthyLocations: 1, failedLocations: 0, unknownLocations: 0, reportingLocations: 1, meanResponseMs: 120, medianResponseMs: 120, canResolveIncident: true }, locations: [{ id: 'l1', name: 'Accra', available: true, state: 'Up', latest }], items: [latest], total: 1, mapLocations: [{ id: 'l1', name: 'Accra', country: 'Ghana', readiness: 'online', lastContact: at }] };
}
function database(): DatabaseReport {
  return { monitorId: 'd1', targetId: 't1', targetName: 'Database', gatewayName: 'Office', source: { id: 's1', engine: 'postgresql', endpoint: 'database.invalid:5432', database: 'app', lastSeen: at }, status: 'Up', collectionState: 'fresh', scrapeState: 'healthy', end: at, latest: [{ key: 'connections', name: 'postgresql.connections', unit: '1', value: 12, cumulative: false, rate: null, at, attributes: { database: 'app' } }], alert: { enabled: false, state: 'Unknown', reason: '' } };
}

test('Cloud and Database cards and target links use safe, read-only V3 reports', () => {
  for (const [type, path, id] of [['CLOUD', cloudPath, 'c1'], ['DATABASE', databasePath, 'd1']]) {
    assert.equal(monitorReportPath({ type, monitorID: id }), path);
    assert.ok(validReportPath(path));
    assert.equal(canonicalReportPath(path), path);
    const card = monitorCard({ ID: id, monitorID: id, targetID: 't1', type, label: 'Site', status: 'Unknown', rtt: '0 ms' } as Monitor);
    assert.equal(card.reportPath, path);
    assert.equal(card.measurement, 'No recent data');
  }
  for (const path of ['/v3/cloudAgents/c1/report', '/v3/cloudMonitors/c1/report/run', '/v3/databaseMonitors/d1/alert', '/v3/cloudMonitors/%2e%2e/report', '/v3/cloudMonitors/%2fsecrets/report']) assert.equal(validReportPath(path), false);
  assert.equal(incidentResourceLabel({ kind: 'cloud' }), 'Cloud monitor');
});

test('an ID-only Cloud link resolves a legacy 404, preserving the report window', async () => {
  const calls: string[] = [];
  const read: ReportRead = async <T>(path: string) => { calls.push(path); if (path.startsWith('/v2/')) throw new ApiError('Not found', 404); return cloud() as T; };
  const result = await readStatusReport('/v2/monitors/c1/uptime?window=7d', read);
  assert.equal(result.path, cloudPath);
  assert.deepEqual(calls, ['/v2/monitors/c1/uptime?window=7d', `${cloudPath}?window=7d`]);
});
test('database links resolve their monitor type instead of showing fabricated uptime', async () => {
  const calls: string[] = [];
  const read: ReportRead = async <T>(path: string) => { calls.push(path); return (path.startsWith('/v2/') ? { monitor: { type: 'DATABASE' } } : database()) as T; };
  assert.equal((await readStatusReport('/v2/monitors/d1/uptime?window=24h', read)).path, databasePath);
  assert.deepEqual(calls, ['/v2/monitors/d1/uptime?window=24h', `${databasePath}?window=24h`]);
});
test('permission, throttling, network and malformed-response failures never probe another resource', async () => {
  for (const status of [401, 403, 429, 500, 502]) {
    let calls = 0;
    const error = new ApiError('Unavailable', status);
    const read: ReportRead = async () => { calls++; throw error; };
    await assert.rejects(readStatusReport('/v2/monitors/c1/uptime?window=1h', read), (caught) => caught === error);
    assert.equal(calls, 1);
  }
});
test('a missing Database report never falls through to a Cloud report', async () => {
  const calls: string[] = [];
  const read: ReportRead = async <T>(path: string) => { calls.push(path); if (path.startsWith('/v2/')) return { monitor: { type: 'DATABASE' } } as T; throw new ApiError('Missing database', 404); };
  await assert.rejects(readStatusReport('/v2/monitors/d1/uptime', read), /Missing database/);
  assert.equal(calls.length, 2);
});
test('direct Cloud selection is one read and retains the selected location', async () => {
  const calls: string[] = [];
  const read: ReportRead = async <T>(path: string) => { calls.push(path); return cloud() as T; };
  const path = `${cloudPath}?window=1h&locationId=l1&limit=25`;
  assert.equal((await readStatusReport(path, read)).path, cloudPath);
  assert.deepEqual(calls, [path]);
});
test('new report contracts accept real values and additive fields', () => {
  assert.ok(validResponse(cloudPath, { ...cloud(), future: true }));
  assert.ok(validResponse(databasePath, database()));
  assert.ok(validResponse(cloudPath, { ...cloud(), mapLocations: undefined }));
  assert.ok(validResponse(databasePath, { ...database(), latest: [] }));
});
test('Cloud contract guards reject cross-location rows, missing results and invalid types', () => {
  const r = cloud();
  for (const invalid of [{ ...r, locations: null }, { ...r, generatedAt: 'bad-date' }, { ...r, locations: [{ ...r.locations[0], id: 'foreign' }] }, { ...r, items: [{ ...r.items[0], locationId: 'foreign' }] }, { ...r, items: [{ ...r.items[0], dnsMs: {} }] }, { ...r, mapLocations: [{ ...r.mapLocations![0], id: 'foreign' }] }, { ...r, summary: { ...r.summary, meanResponseMs: '120' } }]) assert.equal(validResponse(cloudPath, invalid), false);
});
test('Database contract guards reject invalid measurements rather than rendering them', () => {
  const r = database();
  for (const invalid of [{ ...r, latest: null }, { ...r, source: {} }, { ...r, latest: [{ ...r.latest[0], unit: {} }] }, { ...r, latest: [{ ...r.latest[0], attributes: { database: {} } }] }, { ...r, latest: [{ ...r.latest[0], value: NaN }] }, { ...r, openIncidents: -1 }]) assert.equal(validResponse(databasePath, invalid), false);
});
test('Cloud response times do not invent zeros for missing or unknown checks', () => {
  assert.equal(cloudResponse(null), 'N/A');
  assert.equal(cloudResponse({ ...cloud().items[0], completedAt: null, totalMs: 0 }), 'N/A');
  assert.equal(cloudResponse({ ...cloud().items[0], state: 'Unknown', totalMs: 0 }), 'N/A');
  assert.equal(cloudResponse({ ...cloud().items[0], totalMs: 0 }), '0 ms');
});
test('database counters use measured rates and dimension labels, never cumulative totals as current rates', () => {
  const metric = database().latest[0];
  assert.equal(databaseValue({ ...metric, value: 10000, cumulative: true, rate: null }), 'N/A');
  assert.equal(databaseValue({ ...metric, value: 10000, cumulative: true, rate: 2 }), '2 count/s');
  assert.equal(databaseValue({ ...metric, unit: 'By', value: 1024 ** 3 }), '1.00 GiB');
  assert.match(databaseMetricName(metric), /connections · database: app/);
  assert.equal(databaseFresh({ ...database(), collectionState: 'partial' }, now), false);
  assert.equal(databaseFresh({ ...database(), source: { ...database().source, lastSeen: new Date(now - 600000).toISOString() } }, now), false);
});
test('quorum-only Cloud success, unknown locations and paused collection never clear outage alerts', () => {
  const r = cloud();
  assert.ok(monitorRecoveryEvidence({ path: cloudPath, report: r }, now).healthy);
  for (const report of [{ ...r, collectionEnabled: false }, { ...r, monitor: { ...r.monitor, enabled: false } }, { ...r, summary: { ...r.summary, unknownLocations: 1 } }, { ...r, summary: { ...r.summary, canResolveIncident: false } }, { ...r, summary: { ...r.summary, state: 'Down' } }]) assert.equal(monitorRecoveryEvidence({ path: cloudPath, report }, now).healthy, false);
});
test('Database recovery requires current, complete healthy scrape evidence', () => {
  const r = database();
  assert.ok(monitorRecoveryEvidence({ path: databasePath, report: { ...r, openIncidents: 0 } }, now).healthy);
  assert.equal(monitorRecoveryEvidence({ path: databasePath, report: { ...r, openIncidents: 1 } }, now).healthy, false);
  assert.equal(monitorRecoveryEvidence({ path: databasePath, report: r }, now).healthy, false);
  for (const scrapeState of ['partial', 'failed', 'unavailable', 'not_reported']) assert.equal(monitorRecoveryEvidence({ path: databasePath, report: { ...r, scrapeState } }, now).healthy, false);
});
test('Inbox recovery resolves new monitor protocols without changing server read state', async () => {
  const alert: NotificationInboxItem = { id: 'a1', eventType: 'monitor_down', resourceType: 'monitor', resourceId: 'c1', title: 'Down', body: 'Website', read: false, createdAt: new Date(now - 60000).toISOString() };
  const paths: string[] = [];
  const read: ReportRead = async <T>(path: string) => { paths.push(path); if (path.startsWith('/v2/')) throw new ApiError('Not found', 404); return cloud() as T; };
  const ledger = await checkRecoveries([alert], {}, { read, now, current: () => true, load: async () => null, save: async () => {} });
  assert.equal(ledger?.['monitor:c1'], now);
  assert.ok(paths.every((path) => !path.includes('/read')));
});
