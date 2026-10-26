import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageMessage, collectionLabel, serverUsage, snmpHealthValue } from './report-presentation.ts';

test('partial service coverage is distinct from availability and missing metadata does not imply full coverage', () => {
  assert.equal(coverageMessage(undefined), undefined);
  assert.equal(coverageMessage({ percent: 100, knownSeconds: 100, unknownSeconds: 0 }), undefined);
  assert.match(coverageMessage({ percent: 50, knownSeconds: 7200, unknownSeconds: 7200 })!, /50.0% coverage.*2h 0m/);
  assert.match(coverageMessage({ percent: 90, knownSeconds: 90, unknownSeconds: 10 })!, /10s/);
  assert.equal(collectionLabel('awaiting_fresh_result'), 'Awaiting fresh result');
});

test('current server usage uses per-core idle, used memory and the fullest disk, with no invented values for missing data', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const at = '2026-10-15T11:59:00Z';
  const metrics: Parameters<typeof serverUsage>[0] = [
    { name: 'system.cpu.utilization', value: .8, attributes: { state: 'idle', cpu: '0' }, at },
    { name: 'system.cpu.utilization', value: .6, attributes: { state: 'idle', cpu: '1' }, at },
    { name: 'system.memory.utilization', value: .4, attributes: { state: 'used' }, at },
    { name: 'system.memory.utilization', value: .2, attributes: { state: 'cached' }, at },
    { name: 'system.filesystem.utilization', value: .3, attributes: { mountpoint: '/' }, at },
    { name: 'system.filesystem.utilization', value: .9, attributes: { mountpoint: '/data' }, at },
  ];
  const usage = serverUsage(metrics, now);
  assert.ok(Math.abs(usage.cpu! - 30) < .001);
  assert.equal(usage.memory, 40);
  assert.equal(usage.filesystem, 90);
  assert.deepEqual(serverUsage([], now), { cpu: null, memory: null, filesystem: null });
  assert.deepEqual(serverUsage(metrics, now + 600_000), { cpu: null, memory: null, filesystem: null });
  assert.equal(serverUsage([{ ...metrics[0], at: 'bad date' }], now).cpu, null);
});

test('SNMP device detail durations use readable units while enum labels and response latency stay meaningful', () => {
  assert.equal(snmpHealthValue({ currentValue: '71400000 cs', currentMetric: { key: 'device.uptime', value: 71400000, unit: 'cs' } }), '8d 6h 20m');
  assert.equal(snmpHealthValue({ currentValue: 'Up', currentMetric: { key: 'interface.oper_status', value: 1 } }), 'Up');
  assert.equal(snmpHealthValue({ currentValue: '12 ms', currentMetric: { key: 'response_time', value: 12, unit: 'ms' } }), '12 ms');
});
