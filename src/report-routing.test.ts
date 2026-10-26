import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalReportPath, incidentDestination, isDirectMonitorReport, monitorReportPath, validReportPath } from './report-routing.ts';
import { monitorCard, serviceCard } from './live-status.ts';
import type { Incident, Monitor, ServiceStatus } from './types.ts';

test('opens each protocol using its resource ID rather than treating every ID as an uptime monitor', () => {
  assert.equal(monitorReportPath({ type: 'PATH', monitorID: 'path-1' }), '/v2/monitors/path-1/path');
  assert.equal(monitorReportPath({ type: 'server', monitorID: 'host-1' }), '/v2/monitors/host-1/host');
  assert.equal(monitorReportPath({ type: 'HOST', monitorID: 'host-1' }), '/v2/monitors/host-1/host');
  assert.equal(monitorReportPath({ type: 'WINRM', monitorID: 'windows-1' }), '/v3/monitors/windows-1/winrm');
  assert.equal(monitorReportPath({ type: 'FLOW', monitorID: 'm1', flow: { exporterID: 'exporter-1' } }), '/v2/flow/exporters/exporter-1/report');
  assert.equal(monitorReportPath({ type: 'SYSLOG', monitorID: 'm2', syslog: { sourceID: 'source-1' } }), '/v2/syslog/sources/source-1/report');
  assert.equal(monitorReportPath({ type: 'SNMP', monitorID: 'm3', snmp: { endpointID: 'device-1' } }), '/v2/snmp/endpoints/device-1/report');
  assert.equal(monitorReportPath({ type: 'SNMP', monitorID: 'port-1', snmp: { endpointID: 'device-1' }, liveMetric: { kind: 'interface_throughput', label: '12 Mbps', value: 12_000_000 } }), '/v2/monitors/port-1/interface');
  assert.equal(monitorReportPath({ type: 'HTTP', monitorID: 'http-1' }), '/v2/monitors/http-1/uptime');
});

test('aggregated SNMP devices open device reports and missing exporter metadata falls back to the target', () => {
  const device = { ID: 'device-1', targetID: 't1', type: 'SNMP', snmp: { endpointID: 'device-1' } } as Monitor;
  assert.equal(monitorCard(device).detailView, 'monitors');
  assert.equal(monitorCard(device).detailId, 'device-1');
  assert.equal(monitorCard(device).reportPath, '/v2/snmp/endpoints/device-1/report');
  const exporter = monitorCard({ ...device, type: 'FLOW', monitorID: 'm1', flow: {} });
  assert.equal(exporter.detailView, 'targets');
  assert.equal(exporter.detailId, 't1');
});

test('accepts only supported API-local report paths, including for backend-provided destinations', () => {
  assert.ok(validReportPath('/v2/monitors/host-1/host'));
  assert.ok(validReportPath('/v3/monitors/windows-1/winrm'));
  assert.equal(validReportPath('/v3/monitors/windows-1/winrm/run'), false);
  assert.ok(validReportPath('/v2/monitors/abc/path'));
  assert.ok(validReportPath('/v2/snmp/endpoints/device-1/report'));
  for (const path of ['https://example.com/v2/monitors/id/uptime', '//example.com', '/v2/settings/security', '/v2/monitors/id/path/run', '/v2/monitors/../uptime', '/v2/monitors/%2e%2e/uptime', '/v2/monitors/%2fsettings/uptime', '/v2/monitors/%/uptime', '/v2/monitors/id/uptime?token=x']) assert.equal(validReportPath(path), false, path);
});

test('canonicalizes old host report links and resolves direct protocol types', () => {
  assert.equal(canonicalReportPath('/v2/monitors/h1/server'), '/v2/monitors/h1/host');
  assert.equal(canonicalReportPath('/v3/monitors/w1/winrm'), '/v3/monitors/w1/winrm');
  assert.equal(canonicalReportPath('https://example.com/server'), undefined);
  for (const type of ['HOST', 'SERVER', 'WINRM', 'PATH']) assert.ok(isDirectMonitorReport(type));
  assert.equal(isDirectMonitorReport('HTTP'), false);
});

test('opens brief incident details for application events without monitor IDs', () => {
  assert.deepEqual(incidentDestination({ id: 'a1', kind: 'apm', applicationId: 'app1' } as Incident), { pathname: '/incident/[id]', params: { id: 'a1' } });
});

test('routes incident kinds without constructing links from empty monitor or target IDs', () => {
  assert.deepEqual(incidentDestination({ kind: 'probe', probeID: 'g1', monitorID: '', targetID: '' } as Incident), { pathname: '/probe/[id]', params: { id: 'g1' } });
  assert.deepEqual(incidentDestination({ kind: 'service', serviceID: 's1' } as Incident), { pathname: '/status/[view]/[id]', params: { view: 'services', id: 's1' } });
  assert.equal(incidentDestination({ kind: 'probe', monitorID: '', targetID: '' } as Incident), undefined);
});

test('service cards show probable-cause status text and qualify incomplete availability coverage', () => {
  const card = serviceCard({ serviceID: 's1', label: 'Payments', status: 'degraded', statusMessage: 'Database health unavailable', customerImpact: 'No customer impact', metric: { caption: '24h availability', label: '100%', coverage: { percent: 10, knownSeconds: 600, unknownSeconds: 5400 } } } as ServiceStatus);
  assert.equal(card.subtitle, 'Database health unavailable');
  assert.equal(card.measurement, '100%');
  assert.equal(card.note, 'Partial monitoring data');
});
