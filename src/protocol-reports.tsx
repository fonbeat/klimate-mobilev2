import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, SectionTitle, StatusPill, SummaryStrip } from './components';
import { DetailCard, formatDate, formatPercent, Notice, ReportHeader } from './report-components';
import { bitsPerSecond, readableDuration } from './monitor-display';
import { useV2Theme } from './theme';
import { spacing, typography } from './tokens';
import { serverUsage, snmpHealthValue } from './report-presentation';
import { displayMetric } from './metric-display';

type ReportMetric = { formatted: string; value?: number | null };
type GatewayRef = { name: string; status?: string };
export type PathReport = {
  monitor: { name: string; address: string }; target: { name: string }; status: string; statusLabel: string; lastUpdated: string;
  summary: { endToEndLatency: ReportMetric; packetLoss: ReportMetric; jitter: ReportMetric; pathChanges: number };
  insight?: { title: string; description: string };
  currentPath?: { observedAt: string; reachedDestination: boolean; nodes: { hop: number; name: string; address: string; latencyFormatted: string; lossFormatted: string; status: string; provider?: string | null }[] } | null;
  incidentEvidence?: { incidentId: string; role: string; observedAt: string }[];
};
export type InterfaceReport = {
  interface: { name: string; status: string; statusMessage: string; speed: string; lastChecked: string; device: { name: string; host: string }; probe: GatewayRef; adminStatus: { label: string }; operationalStatus: { label: string } };
  inboundTraffic: { currentBps: number | null }; outboundTraffic: { currentBps: number | null };
  utilization: { formatted: string }; errors: { formatted: string }; discards: { formatted: string };
};
export type DeviceReport = {
  device: { name: string; host: string; vendorModel: string; status: string; statusMessage: string; uptimeSeconds: number | null; lastChecked: string; probe: GatewayRef };
  availability: { formatted: string }; responseTime: { current: string };
  monitors: { monitorID: string; name: string; category?: string; type: string; status: string; currentValue: string; currentMetric?: { key: string; value?: number | null; unit?: string } | null; statusMessage: string; thresholds: { enabled: boolean; formatted: string }; interfaceTraffic?: unknown }[];
};
export type FlowReport = {
  exporter: { name: string; sourceIP: string; status: string; statusLabel: string; lastFlow: string; protocolLabel: string; probe: GatewayRef };
  summary: { totalFlows: ReportMetric; totalBytes: ReportMetric; averageFlowRate: ReportMetric; uniquePeers: ReportMetric };
  topTalkers: { address: string; host?: string; formattedBytes: string }[];
  topApplications: { name: string; formattedBytes: string }[];
};
export type SyslogReport = {
  source: { name: string; sourceIp: string }; collection: { status: string; statusLabel: string; lastReceived: string; probe: GatewayRef; note: string };
  summary: { totalEvents: ReportMetric; criticalAndError: { formatted: string }; activeFindings: { total: number }; eventRate: { average: string } };
  findings: { id: string; title: string; description?: string; severity: string; state?: string }[];
};
export type ServerReport = {
  host: { name: string; os: string; lastSeen: string }; targetName?: string; status: string; message: string;
  metrics: { name: string; value: number; unit: string; at: string; attributes: Record<string, string> }[];
  points: { at: string; cpuPercent: number | null; memoryPercent: number | null; filesystemPercent: number | null }[];
};
export type WinRMReport = {
  name: string; targetName: string; kind: string; resource: string; status: string; message: string;
  currentValue: number | null; lastCheckedAt: string | null;
};
export type ProtocolReport = PathReport | InterfaceReport | DeviceReport | FlowReport | SyslogReport | ServerReport | WinRMReport;

export function ProtocolDetail({ path, report }: { path: string; report: ProtocolReport }) {
  if (path.endsWith('/path')) return <PathDetail report={report as PathReport} />;
  if (path.endsWith('/interface')) return <InterfaceDetail report={report as InterfaceReport} />;
  if (path.endsWith('/host') || path.endsWith('/server')) return <ServerDetail report={report as ServerReport} />;
  if (path.endsWith('/winrm')) return <WinRMDetail report={report as WinRMReport} />;
  if (path.includes('/snmp/')) return <DeviceDetail report={report as DeviceReport} />;
  if (path.includes('/flow/')) return <FlowDetail report={report as FlowReport} />;
  return <SyslogDetail report={report as SyslogReport} />;
}

function PathDetail({ report: r }: { report: PathReport }) {
  return <><ReportHeader title={r.monitor.name} subtitle={`PATH · ${r.target.name}`} status={r.status} message={r.statusLabel} />
    <SummaryStrip items={[{ label: 'Latency', value: r.summary.endToEndLatency.formatted }, { label: 'Loss', value: r.summary.packetLoss.formatted }, { label: 'Jitter', value: r.summary.jitter.formatted }]} />
    {r.insight && <Notice>{`${r.insight.title}. ${r.insight.description}`}</Notice>}
    <DetailCard rows={[[ 'Address', r.monitor.address ], ['Route changes', String(r.summary.pathChanges)], ['Route observed', formatDate(r.currentPath?.observedAt)], ['Destination', r.currentPath ? r.currentPath.reachedDestination ? 'Reached' : 'Not reached' : 'No route data']]} />
    {!!r.currentPath?.nodes.length && <><SectionTitle>Observed route</SectionTitle>{r.currentPath.nodes.map((node, i) => <DetailCard key={`${node.hop}-${i}`} rows={[[`Hop ${node.hop}`, node.name || node.address || 'No reply'], ['Latency · reply loss', `${displayMetric(node.latencyFormatted)} · ${displayMetric(node.lossFormatted)}`], ['Network', node.provider]]} />)}<Notice>Intermediate-hop reply loss can reflect ICMP filtering. It does not establish a destination outage.</Notice></>}
    {!!r.incidentEvidence?.length && <><SectionTitle>Incident evidence</SectionTitle><DetailCard rows={r.incidentEvidence.map((item) => [item.role === 'recovery' ? 'Recovery observation' : 'Outage observation', formatDate(item.observedAt)])} /></>}
  </>;
}

function InterfaceDetail({ report: r }: { report: InterfaceReport }) {
  const i = r.interface;
  return <><ReportHeader title={i.name} subtitle={`SNMP · ${i.device.name}`} status={i.status} message={i.statusMessage} />
    <SummaryStrip items={[{ label: 'Inbound', value: i.status.toLowerCase() === 'unknown' || r.inboundTraffic.currentBps == null ? '—' : bitsPerSecond(r.inboundTraffic.currentBps) }, { label: 'Outbound', value: i.status.toLowerCase() === 'unknown' || r.outboundTraffic.currentBps == null ? '—' : bitsPerSecond(r.outboundTraffic.currentBps) }, { label: 'Utilization', value: i.status.toLowerCase() === 'unknown' ? '—' : r.utilization.formatted }]} />
    <DetailCard rows={[[ 'Capacity', i.speed ], ['Administrative state', i.adminStatus.label], ['Operational state', i.operationalStatus.label], ['Errors', r.errors.formatted], ['Discards', r.discards.formatted], ['Gateway', i.probe?.name], ['Last checked', i.lastChecked]]} />
  </>;
}

function DeviceDetail({ report: r }: { report: DeviceReport }) {
  const { colors } = useV2Theme();
  return <><ReportHeader title={r.device.name} subtitle={`SNMP · ${r.device.host}`} status={r.device.status} message={r.device.statusMessage} />
    {r.device.status.toLowerCase() === 'unknown' && <Notice>Device data is unavailable or stale. Historical availability remains scoped to the selected period.</Notice>}
    <SummaryStrip items={[{ label: 'Availability', value: r.availability.formatted }, { label: 'Response', value: r.device.status.toLowerCase() === 'unknown' ? '—' : r.responseTime.current }, { label: 'Uptime', value: r.device.status.toLowerCase() === 'unknown' || r.device.uptimeSeconds == null ? '—' : readableDuration(r.device.uptimeSeconds) }]} />
    <DetailCard rows={[[ 'Device', r.device.vendorModel ], ['Gateway', r.device.probe?.name], ['Last checked', r.device.lastChecked]]} />
    <SectionTitle>Health metrics</SectionTitle>{(r.monitors ?? []).map((monitor) => {
      const isInterface = !!monitor.interfaceTraffic || /^interfaces?$/i.test(monitor.category ?? '');
      return <Pressable key={monitor.monitorID} accessibilityRole={isInterface ? 'button' : undefined} disabled={!isInterface} onPress={() => router.push({ pathname: '/status/[view]/[id]', params: { view: 'monitors', id: monitor.monitorID, reportPath: `/v2/monitors/${encodeURIComponent(monitor.monitorID)}/interface` } } as Href)}><Card><View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}><Text style={[typography.cardTitle, { flex: 1, color: colors.ink }]}>{monitor.name}</Text><StatusPill status={monitor.status} /></View><Text style={[typography.body, { color: colors.ink, marginTop: spacing.sm }]}>{r.device.status.toLowerCase() === 'unknown' || monitor.status.toLowerCase() === 'unknown' ? 'No recent data' : snmpHealthValue(monitor)}</Text>{!!monitor.statusMessage && <Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.xs }]}>{monitor.statusMessage}</Text>}{monitor.thresholds?.enabled && <Text style={[typography.metadata, { color: colors.muted }]}>{monitor.thresholds.formatted}</Text>}</Card></Pressable>;
    })}
  </>;
}

function FlowDetail({ report: r }: { report: FlowReport }) {
  return <><ReportHeader title={r.exporter.name} subtitle={`FLOW · ${r.exporter.sourceIP}`} status={r.exporter.status} message={r.exporter.statusLabel} />
    <SummaryStrip items={[{ label: 'Flows', value: r.summary.totalFlows.formatted }, { label: 'Data', value: r.summary.totalBytes.formatted }, { label: 'Avg rate', value: r.summary.averageFlowRate.formatted }]} />
    <DetailCard rows={[[ 'Protocol', r.exporter.protocolLabel ], ['Last flow', r.exporter.lastFlow], ['Gateway', r.exporter.probe?.name], ['Unique peers', r.summary.uniquePeers.formatted]]} />
    {!!r.topTalkers?.length && <><SectionTitle>Top talkers</SectionTitle><DetailCard rows={r.topTalkers.slice(0, 10).map((item) => [item.host || item.address, item.formattedBytes])} /></>}
    {!!r.topApplications?.length && <><SectionTitle>Top applications</SectionTitle><DetailCard rows={r.topApplications.slice(0, 10).map((item) => [item.name, item.formattedBytes])} /></>}
  </>;
}

function SyslogDetail({ report: r }: { report: SyslogReport }) {
  const { colors } = useV2Theme();
  return <><ReportHeader title={r.source.name} subtitle={`SYSLOG · ${r.source.sourceIp}`} status={r.collection.status} message={r.collection.note || r.collection.statusLabel} />
    <SummaryStrip items={[{ label: 'Events', value: r.summary.totalEvents.formatted }, { label: 'Critical / error', value: r.summary.criticalAndError.formatted }, { label: 'Findings', value: r.summary.activeFindings.total }]} />
    <DetailCard rows={[[ 'Last received', r.collection.lastReceived ], ['Average event rate', r.summary.eventRate.average], ['Gateway', r.collection.probe?.name]]} />
    {!!r.findings?.length && <><SectionTitle>Findings</SectionTitle>{r.findings.map((finding) => <Card key={finding.id}><View style={{ flexDirection: 'row', gap: spacing.md }}><Text style={[typography.cardTitle, { flex: 1, color: colors.ink }]}>{finding.title}</Text><StatusPill status={finding.severity} domain="attention" /></View>{!!finding.description && <Text style={[typography.body, { color: colors.muted, marginTop: spacing.sm }]}>{finding.description}</Text>}</Card>)}</>}
  </>;
}

function ServerDetail({ report: r }: { report: ServerReport }) {
  const usage = serverUsage(r.metrics ?? []);
  const stale = r.status.toLowerCase() !== 'up';
  return <><ReportHeader title={r.host.name} subtitle={`Host · ${r.targetName ?? r.host.os}`} status={r.status} message={r.message} />
    {stale && <Notice>No recent host data. Current measurements are unavailable; missing data does not establish an outage.</Notice>}
    <SummaryStrip items={[{ label: 'CPU', value: stale ? '—' : formatPercent(usage.cpu) }, { label: 'Memory', value: stale ? '—' : formatPercent(usage.memory) }, { label: 'Filesystem', value: stale ? '—' : formatPercent(usage.filesystem) }]} />
    <DetailCard rows={[[ 'Operating system', r.host.os ], ['Last seen', formatDate(r.host.lastSeen)]]} />
  </>;
}

function WinRMDetail({ report: r }: { report: WinRMReport }) {
  const unavailable = ['unknown', 'paused'].includes(r.status.toLowerCase());
  const percent = ['cpu', 'memory', 'volume'].includes(r.kind.toLowerCase());
  return <><ReportHeader title={r.name} subtitle={`WinRM · ${r.targetName}`} status={r.status} message={r.message} />
    {unavailable && <Notice>No recent measurement is available. Missing data does not establish an outage.</Notice>}
    {percent && <SummaryStrip items={[{ label: 'Current usage', value: unavailable || r.currentValue == null || !Number.isFinite(r.currentValue) ? '—' : formatPercent(r.currentValue) }]} />}
    <DetailCard rows={[[ 'Resource', r.resource ], ['Last checked', formatDate(r.lastCheckedAt)]]} />
  </>;
}
