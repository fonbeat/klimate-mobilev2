import assert from 'node:assert/strict';
import test from 'node:test';
import { cardsForPage, liveStatusPath, statusCounts, statusFilterCounts, statusFilters } from './live-status.ts';
import type { MonitorPage, ServiceStatusPage, TargetStatusPage } from './types.ts';

test('uses the matching live-status endpoint and filter for each view', () => {
  assert.equal(liveStatusPath('targets', 30, 30, 'Affected', 'router 1'), '/v2/status/targets?offset=30&limit=30&status=affected&search=router+1');
  assert.equal(liveStatusPath('services', 0, 3, 'Degraded', ''), '/v2/status/services?offset=0&limit=3&status=degraded');
  assert.ok(statusFilters('monitors').includes('Attention'));
  assert.ok(statusFilters('targets').includes('Affected'));
  assert.ok(statusFilters('services').includes('Degraded'));
});

test('maps each feed to the same card shape and correct detail resource', () => {
  const targets: TargetStatusPage = { offset: 0, limit: 3, total: 1, records: [{ ID: 't1', targetID: 't1', label: 'Router', address: '10.0.0.1', status: 'Attention', statusMessage: '1 affected', monitorCount: 3, affectedCount: 1, tags: [] }] };
  const services: ServiceStatusPage = { offset: 0, limit: 3, total: 1, records: [{ ID: 's1', serviceID: 's1', label: 'Payments', status: 'degraded', statusMessage: 'Elevated latency', monitoringLimited: false, customerImpact: 'Some requests are slow', probableCause: 'Network', metric: { kind: 'availability', caption: '24H AVAILABILITY', label: '98.5%' } }] };
  const monitors: MonitorPage = { offset: 0, limit: 3, total: 1, records: [{ ID: 'm1', monitorID: 'm1', targetID: 't1', label: 'Router ping', monitorLabel: 'Ping', host: '10.0.0.1', type: 'ping', status: 'Down', statusMessage: 'Timed out', rtt: '', probeName: 'Accra', lastChecked: '', tags: [] }] };
  assert.deepEqual(cardsForPage('targets', targets)[0], { id: 't1', label: 'Router', subtitle: '10.0.0.1', status: 'Attention', kind: '3 monitors', measurement: '1 affected', detailView: 'targets', detailId: 't1' });
  assert.equal(cardsForPage('services', services)[0].detailId, 's1');
  assert.equal(cardsForPage('monitors', monitors)[0].detailView, 'monitors');
  const aggregate = { ...monitors, records: [{ ...monitors.records[0], ID: 'endpoint-1', monitorID: '' }] };
  assert.deepEqual({ id: cardsForPage('monitors', aggregate)[0].id, detailView: cardsForPage('monitors', aggregate)[0].detailView }, { id: 'endpoint-1', detailView: 'targets' });
});

test('keeps service counts distinct from monitor and target counts', () => {
  const page: ServiceStatusPage = { offset: 0, limit: 3, total: 1, records: [], summary: { totalServices: 8, healthyServices: 5, degradedServices: 2, downServices: 1, unknownServices: 0 } };
  assert.deepEqual(statusCounts('services', page), { total: 8, healthy: 5, down: 1, attention: 2, unknown: 0 });
  assert.deepEqual(statusFilterCounts('services', page), { All: 8, Down: 1, Degraded: 2, Healthy: 5, Unknown: 0 });
  assert.equal(statusFilterCounts('services', null), undefined);
});
