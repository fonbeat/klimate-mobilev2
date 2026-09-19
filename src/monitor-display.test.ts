import assert from 'node:assert/strict';
import test from 'node:test';
import { monitorMeasurement, monitorProtocolLabel } from './monitor-display.ts';

test('shows the SNMP device-health metric in the protocol label', () => {
  assert.equal(monitorProtocolLabel({
    type: 'snmp',
    monitorLabel: 'SNMP monitor',
    displayName: 'Device Health',
    snmp: { healthMetric: { label: 'Device Health', value: 100 } },
  }), 'SNMP · Device Health');
});

test('shows the SNMP interface-health metric in the protocol label', () => {
  assert.equal(monitorProtocolLabel({
    type: 'SNMP',
    monitorLabel: 'SNMP monitor',
    displayName: 'Gi1/01/1 Health',
    liveMetric: { kind: 'interface_throughput', label: '1 bps', value: 1, unit: 'bps' },
  }), 'SNMP · Gi1/01/1 Health');
});

test('falls back to the monitor label when the API has no metric label', () => {
  assert.equal(monitorProtocolLabel({
    type: 'SNMP',
    monitorLabel: 'Interface Health',
  }), 'SNMP · Interface Health');
});

test('formats SNMP interface throughput using a readable bit-rate unit', () => {
  const measurement = (value: number) => monitorMeasurement({
    type: 'SNMP',
    liveMetric: { kind: 'interface_throughput', value, unit: 'bps' },
  });

  assert.equal(measurement(999), '999 bps');
  assert.equal(measurement(1_500), '1.5 Kbps');
  assert.equal(measurement(32_000_000), '32 Mbps');
  assert.equal(measurement(2_500_000_000), '2.5 Gbps');
});

test('formats SNMP uptime reported in centiseconds as a readable duration', () => {
  const eightDaysSixHoursFortyMinutes = ((8 * 24 * 60) + (6 * 60) + 40) * 60 * 100;
  assert.equal(monitorMeasurement({
    type: 'SNMP',
    liveMetric: { kind: 'device.uptime', value: eightDaysSixHoursFortyMinutes, unit: 'centiseconds' },
  }), '8d 6h 40m');
});

test('formats SNMP durations regardless of their source time unit', () => {
  const measurement = (value: number, unit: string) => monitorMeasurement({
    type: 'SNMP',
    liveMetric: { kind: 'device.uptime', value, unit },
  });

  assert.equal(measurement(714_000, 'seconds'), '8d 6h 20m');
  assert.equal(measurement(11_900, 'minutes'), '8d 6h 20m');
  assert.equal(measurement(198 + (20 / 60), 'hours'), '8d 6h 20m');
  assert.equal(measurement(8 + (6 / 24) + (20 / 1_440), 'days'), '8d 6h 20m');
});

test('does not treat SNMP response latency as an uptime duration', () => {
  assert.equal(monitorMeasurement({
    type: 'SNMP',
    liveMetric: { kind: 'snmp_response_time', value: 18, unit: 'ms' },
  }), '18 ms');
});
