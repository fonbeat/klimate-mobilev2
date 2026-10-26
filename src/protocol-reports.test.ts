import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import type { ProtocolReport } from './protocol-reports';

// Render the actual report components against API-shaped fixtures. Native hosts and
// navigation are replaced so these checks run without a simulator or credentials.
const nativeRequire = createRequire(import.meta.url);
const cache = new Map<string, Record<string, unknown>>();
const children = (props: { children?: React.ReactNode }) => props.children;
function load(file: string): Record<string, unknown> {
  const saved = cache.get(file);
  if (saved) return saved;
  const module = { exports: {} as Record<string, unknown> };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireLocal = (name: string): unknown => {
    if (name === 'expo-router') return { router: { push: () => {} } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles } };
    if (name === './theme') return { useV2Theme: () => ({ colors: { ink: '#222', muted: '#666' } }) };
    if (name === './components') return { Card: children, SectionTitle: children, StatusPill: ({ status }: { status: string }) => { assert.equal(typeof status, 'string'); return status; }, SummaryStrip: ({ items }: { items: { label: string; value: string | number }[] }) => items.map(({ label, value }) => { assert.ok(typeof value === 'string' || typeof value === 'number', `${label} must have a renderable value`); return `${label}: ${value}`; }) };
    if (name.startsWith('.')) {
      const path = resolve(dirname(file), name);
      if (/\.tsx?$/.test(path)) return load(path);
      try { return load(`${path}.ts`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return load(`${path}.tsx`); }
    }
    return nativeRequire(name);
  };
  const evaluate = runInNewContext(`(function(require, module, exports) { ${compiled}\n })`);
  evaluate(requireLocal, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  assert.ok(React.isValidElement(node), 'Report passed an object instead of display text');
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') return textOf((element.type as (props: unknown) => React.ReactNode)(element.props));
  return textOf(element.props.children);
}

const gateway = { name: 'Accra Gateway' };
const fixtures: { path: string; report: ProtocolReport; expected: string[] }[] = [
  { path: '/v2/monitors/p1/path', report: { monitor: { name: 'Office WAN', address: '1.1.1.1' }, target: { name: 'Office' }, status: 'Attention', statusLabel: 'Packet loss detected', lastUpdated: '2026-10-15T12:00:00Z', summary: { endToEndLatency: { formatted: '20 ms' }, packetLoss: { formatted: '30%' }, jitter: { formatted: '6 ms' }, pathChanges: 2 }, currentPath: { observedAt: '2026-10-15T12:00:00Z', reachedDestination: true, nodes: [{ hop: 1, name: 'Router', address: '10.0.0.1', latencyFormatted: '1 ms', lossFormatted: '0%', status: 'Up' }] }, insight: { title: 'Destination loss', description: 'Investigate the connection' } }, expected: ['Office WAN', 'Loss: 30%', 'Router', 'Investigate the connection'] },
  { path: '/v2/monitors/i1/interface', report: { interface: { name: 'Gi1/0/1 Health', status: 'Up', statusMessage: 'Interface is reporting', speed: '1 Gbps', lastChecked: 'Just now', device: { name: 'Core switch', host: '10.0.0.2' }, probe: gateway, adminStatus: { label: 'Up' }, operationalStatus: { label: 'Up' } }, inboundTraffic: { currentBps: 1_500_000 }, outboundTraffic: { currentBps: 2000 }, utilization: { formatted: '0.2%' }, errors: { formatted: '0' }, discards: { formatted: '0' } }, expected: ['Gi1/0/1 Health', 'Inbound: 1.5 Mbps', 'Outbound: 2 Kbps', 'Accra Gateway'] },
  { path: '/v2/snmp/endpoints/d1/report', report: { device: { name: 'Core switch', host: '10.0.0.2', vendorModel: 'Switch', status: 'Up', statusMessage: 'Healthy', uptimeSeconds: 714000, lastChecked: 'Just now', probe: gateway }, availability: { formatted: '100%' }, responseTime: { current: '10 ms' }, monitors: [{ monitorID: 'm1', name: 'CPU health', type: 'System', status: 'Up', currentValue: '15%', statusMessage: 'Normal', thresholds: { enabled: true, formatted: 'Warning 80%' } }] }, expected: ['Core switch', '8d 6h 20m', 'CPU health', 'Warning 80%'] },
  { path: '/v2/flow/exporters/f1/report', report: { exporter: { name: 'Edge exporter', sourceIP: '10.0.0.3', status: 'Up', statusLabel: 'Receiving', lastFlow: 'Just now', protocolLabel: 'NetFlow', probe: gateway }, summary: { totalFlows: { formatted: '1,000' }, totalBytes: { formatted: '2 GB' }, averageFlowRate: { formatted: '5 flows/s' }, uniquePeers: { formatted: '20' } }, topTalkers: [{ address: '10.0.0.4', formattedBytes: '1 GB' }], topApplications: [{ name: 'HTTPS', formattedBytes: '500 MB' }] }, expected: ['Edge exporter', 'Data: 2 GB', '10.0.0.4', 'HTTPS'] },
  { path: '/v2/syslog/sources/l1/report', report: { source: { name: 'Firewall', sourceIp: '10.0.0.5' }, collection: { status: 'receiving', statusLabel: 'Receiving', lastReceived: 'Just now', probe: gateway, note: 'Messages are stored on the Gateway' }, summary: { totalEvents: { formatted: '500' }, criticalAndError: { formatted: '2' }, activeFindings: { total: 1 }, eventRate: { average: '2 events/s' } }, findings: [{ id: 'finding-1', title: 'Link changed', description: 'Interface flapped three times', severity: 'warning' }] }, expected: ['Firewall', 'Link changed', 'Interface flapped three times'] },
  { path: '/v2/monitors/s1/host', report: { host: { name: 'Database server', os: 'Linux', lastSeen: '2026-10-15T11:00:00Z' }, status: 'Unknown', message: 'No recent host telemetry', metrics: [], points: [{ at: '2026-10-15T11:00:00Z', cpuPercent: 90, memoryPercent: 50, filesystemPercent: 20 }] }, expected: ['Database server', 'CPU: —', 'missing data does not establish an outage'] },
  { path: '/v3/monitors/w1/winrm', report: { name: 'Windows CPU', targetName: 'Office server', kind: 'cpu', resource: '', status: 'Attention', message: 'CPU above warning threshold', currentValue: 92, lastCheckedAt: '2026-10-25T10:00:00Z' }, expected: ['Windows CPU', 'WinRM · Office server', 'Current usage: 92.0%', 'CPU above warning threshold'] },
  { path: '/v3/monitors/w2/winrm', report: { name: 'Windows memory', targetName: 'Office server', kind: 'memory', resource: '', status: 'Unknown', message: 'No recent observation', currentValue: 92, lastCheckedAt: null }, expected: ['Current usage: —', 'Missing data does not establish an outage'] },
  { path: '/v3/monitors/w3/winrm', report: { name: 'Print service', targetName: 'Office server', kind: 'service', resource: 'Spooler', status: 'Down', message: 'Service stopped', currentValue: 0, lastCheckedAt: '2026-10-25T10:00:00Z' }, expected: ['Print service', 'Service stopped', 'Spooler'] },
];

for (const fixture of fixtures) test(`renders ${fixture.path} from its distinct backend contract`, () => {
  const component = load(resolve(dirname(fileURLToPath(import.meta.url)), 'protocol-reports.tsx')).ProtocolDetail as (props: { path: string; report: ProtocolReport }) => React.ReactNode;
  const output = textOf(component(fixture));
  for (const expected of fixture.expected) assert.ok(output.includes(expected), `Missing ${expected} in ${output}`);
});

test('renders a short application incident summary without operational controls or false recovery claims', () => {
  const component = load(resolve(dirname(fileURLToPath(import.meta.url)), 'incident-summary.tsx')).IncidentSummary as (props: unknown) => React.ReactNode;
  const output = textOf(component({ report: { incident: { id: 'a1', kind: 'apm', label: 'Checkout', status: 'resolved', severity: 'critical', rootCause: 'Error rate exceeded', duration: '4m' }, startedAt: '2026-10-25T10:00:00Z', resolvedAt: '2026-10-25T10:04:00Z', recovery: 'Incident closed. Closure may follow confirmed recovery or an administrative action.' } }));
  for (const expected of ['Application event', 'Checkout', 'Error rate exceeded', 'critical', '4m', 'administrative action']) assert.ok(output.includes(expected), output);
  assert.equal(output.includes('Add note'), false);
  assert.equal(output.includes('Monitor event'), false);
});
