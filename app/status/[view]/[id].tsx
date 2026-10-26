import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, FilterBar, Page, SectionTitle, State, StatusPill, SummaryStrip } from '@/components';
import { DetailCard, ReportHeader, Notice, IncidentRows, formatDate, formatPercent } from '@/report-components';
import { ProtocolDetail, type ProtocolReport } from '@/protocol-reports';
import { validReportPath, canonicalReportPath, isDirectMonitorReport, monitorReportPath } from '@/report-routing';
import { useV2Theme } from '@/theme';
import { spacing, typography } from '@/tokens';
import { useApiData } from '@/use-api';
import { usePaginatedApi } from '@/use-paginated-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { useSession } from '@/session';
import { statusViewLabel, statusViews, type StatusView } from '@/status-view';
import { serviceComponentCounts, type ServiceComponentDefinition } from '@/service-components';
import { coverageMessage, collectionLabel } from '@/report-presentation';
import type { AvailabilityCoverage, Incident } from '@/types';

type MonitorReport = {
  monitor: { name: string; displayName?: string; type: string; address: string };
  target: { id: string; name: string }; status: string; statusMessage: string; lastUpdated: string;
  summary: { availabilityPercent: number | null; averageResponseTimeMs: number | null; incidentCount: number };
  configuration: { probe?: { name?: string } };
};
type TargetReport = {
  target: { name: string; address: string; inMaintenance: boolean };
  summary: { health: string; healthReason: string; totalMonitors: number; up: number; attention: number; down: number };
  monitors: { id: string; name: string; type: string; status: string; statusMessage: string; lastChecked: string; reportPath: string; latestResult?: { label: string } }[];
  recentIncidents?: { incidents: Incident[] };
};
type ServiceComponent = { key: string; name: string; kind: string; sourceID: string; state: string; collectionState: string; reason?: string };
type ServiceReport = {
  service: { name: string; health: string; customerImpact: string; probableCause: string; monitoringLimited: boolean };
  definition: ServiceComponentDefinition;
  current: { state: string; customerState: string; customerImpact: string; probableCause: string; monitoringLimited: boolean; affectedIndicators: number; affectedDependencies: number; indicators: ServiceComponent[]; dependencies: ServiceComponent[]; redundancyGroups: { id: string; name: string; members: ServiceComponent[] }[] };
  availabilityPercent?: number | null; availabilityCoverage?: AvailabilityCoverage;
};

export default function StatusDetail() {
  const params = useLocalSearchParams<{ view: string; id: string; reportPath?: string }>();
  const { session } = useSession();
  return <ReportScreen key={`${session?.tenantId}:${params.view}:${params.id}:${params.reportPath ?? ''}`} {...params} />;
}

function ReportScreen({ view: rawView, id, reportPath }: { view: string; id: string; reportPath?: string }) {
  const view = rawView as StatusView;
  const valid = statusViews.includes(view) && !!id && (!reportPath || (view === 'monitors' && validReportPath(reportPath)));
  const { colors } = useV2Theme();
  const [window, setWindow] = useState('24h');
  const path = valid ? (reportPath ? canonicalReportPath(reportPath)! : `/v2/${view}/${encodeURIComponent(id)}/${view === 'monitors' ? 'uptime' : 'report'}`) : '';
  const result = useApiData<MonitorReport | TargetReport | ServiceReport | ProtocolReport>(`${path}?${view === 'services' ? 'availability' : 'window'}=${window}`, valid);
  const report = result.data;
  // Inbox/incident links can contain only a monitor ID. Resolve its protocol from the API.
  const fallback = view === 'monitors' && !reportPath && report ? report as MonitorReport : null;
  const type = fallback?.monitor?.type.toUpperCase();
  const needsTarget = type === 'FLOW' || type === 'SYSLOG' || type === 'SNMP';
  const targetContext = useApiData<TargetReport>(fallback?.target?.id ? `/v2/targets/${encodeURIComponent(fallback.target.id)}/report` : '', !!fallback?.target?.id && needsTarget);
  const resolvedPath = isDirectMonitorReport(type)
    ? monitorReportPath({ monitorID: id, type: type! })
    : targetContext.data?.monitors.find((monitor) => monitor.id === id)?.reportPath;
  const resolving = !!fallback && (isDirectMonitorReport(type) || needsTarget) && (!resolvedPath || !resolvedPath.endsWith('/uptime'));
  const resolutionFailed = resolving && ((!fallback?.target?.id && needsTarget) || (!!targetContext.data && (!resolvedPath || !validReportPath(resolvedPath))));
  useEffect(() => {
    if (resolvedPath && validReportPath(resolvedPath) && !resolvedPath.endsWith('/uptime')) router.replace({ pathname: '/status/[view]/[id]', params: { view, id, reportPath: resolvedPath } } as Href);
  }, [id, resolvedPath, view]);
  const refresh = () => { void result.reload(); if (needsTarget) void targetContext.reload(); };
  useForegroundRefresh(() => { void result.refreshBackground(); if (needsTarget) void targetContext.refreshBackground(); }, valid);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><Page refreshing={result.refreshing} onRefresh={refresh}>
    <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Pressable accessibilityRole="button" accessibilityLabel="Back to status" onPress={() => router.back()} style={{ width: 48, height: 48, justifyContent: 'center' }}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable><Text accessibilityRole="header" style={[typography.sectionTitle, { color: colors.ink }]}>{valid ? statusViewLabel(view).slice(0, -1) : 'Status'}</Text><View style={{ width: 48 }} /></View>
    {valid && <FilterBar options={view === 'services' ? ['24h', '7d', '30d'] : ['1h', '24h', '7d', '30d']} value={window} onChange={setWindow} label="Report period" />}
    {!valid ? <State error="This status item is unavailable." /> : result.errorCode === 'MODULE_DISABLED' ? <Notice>This feature is not enabled for your organization.</Notice> : <State loading={(result.loading && !report) || (resolving && !targetContext.error && !resolutionFailed)} loadingMessage="Loading details…" error={result.error || (resolving ? targetContext.error : null)} onRetry={refresh} />}
    {resolutionFailed && <Notice>The detailed report for this monitor is unavailable.</Notice>}
    {report && view === 'monitors' && !resolving && (path.endsWith('/uptime') ? <MonitorDetail report={report as MonitorReport} /> : <ProtocolDetail path={path} report={report as ProtocolReport} />)}
    {report && view === 'targets' && <TargetDetail report={report as TargetReport} />}
    {report && view === 'services' && <ServiceDetail report={report as ServiceReport} id={id} />}
  </Page></SafeAreaView>;
}

function MonitorDetail({ report: r }: { report: MonitorReport }) {
  return <><ReportHeader title={r.monitor.displayName || r.monitor.name} subtitle={`${r.monitor.type} · ${r.target.name}`} status={r.status} message={r.statusMessage} />
    <SummaryStrip items={[{ label: 'Availability', value: formatPercent(r.summary.availabilityPercent) }, { label: 'Avg response', value: r.summary.averageResponseTimeMs == null ? '—' : `${Math.round(r.summary.averageResponseTimeMs)} ms` }, { label: 'Incidents', value: r.summary.incidentCount }]} />
    <SectionTitle>Monitoring context</SectionTitle><DetailCard rows={[[ 'Address', r.monitor.address ], ['Gateway', r.configuration.probe?.name], ['Last updated', formatDate(r.lastUpdated)]]} />
  </>;
}

function TargetDetail({ report: r }: { report: TargetReport }) {
  const { colors } = useV2Theme();
  return <><ReportHeader title={r.target.name} subtitle={r.target.address} status={r.summary.health} message={r.summary.healthReason} />
    <SummaryStrip items={[{ label: 'Monitors', value: r.summary.totalMonitors }, { label: 'Up', value: r.summary.up, tone: 'positive' }, { label: 'Down', value: r.summary.down, tone: 'critical' }, { label: 'Attention', value: r.summary.attention, tone: 'warning' }]} />
    {r.target.inMaintenance && <Notice>Monitoring is currently in maintenance.</Notice>}
    <SectionTitle>Monitors</SectionTitle>{r.monitors.map((monitor) => <Pressable key={monitor.id} accessibilityRole="button" accessibilityLabel={`Open ${monitor.name}`} onPress={() => router.push({ pathname: '/status/[view]/[id]', params: { view: 'monitors', id: monitor.id, ...(validReportPath(monitor.reportPath) ? { reportPath: monitor.reportPath } : {}) } } as Href)}><Card><View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={[typography.cardTitle, { color: colors.ink }]}>{monitor.name}</Text><Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.xs }]}>{monitor.type} · {monitor.statusMessage || monitor.latestResult?.label || monitor.lastChecked}</Text></View><StatusPill status={monitor.status} /></View></Card></Pressable>)}
    {!r.monitors.length && <Notice>No monitors are attached to this target.</Notice>}
    <IncidentRows incidents={r.recentIncidents?.incidents ?? []} />
  </>;
}

function ServiceDetail({ report: r, id }: { report: ServiceReport; id: string }) {
  const { colors } = useV2Theme();
  const counts = serviceComponentCounts(r.definition);
  const evaluated = [...(r.current.indicators ?? []), ...(r.current.dependencies ?? []), ...(r.current.redundancyGroups ?? []).flatMap((group) => group.members)];
  const coverage = r.availabilityCoverage;
  return <><ReportHeader title={r.service.name} subtitle="Business service" status={r.current.state || r.service.health} message={r.current.probableCause || r.current.customerImpact || r.service.customerImpact} />
    <SummaryStrip items={[{ label: 'Availability', value: formatPercent(r.availabilityPercent) }, { label: 'Indicators', value: counts.indicators }, { label: 'Dependencies', value: counts.dependencies }]} />
    {!!coverageMessage(coverage) && <Notice>{coverageMessage(coverage)!}</Notice>}
    {r.availabilityPercent == null && <Notice>No monitoring data is available for this period.</Notice>}
    <SectionTitle>Impact & cause</SectionTitle><DetailCard rows={[[ 'Customer impact', r.current.customerImpact || r.service.customerImpact ], ['Probable cause', r.current.probableCause || r.service.probableCause], ['Monitoring', r.current.monitoringLimited ? 'Limited coverage' : 'Normal coverage'], ['Affected indicators', String(r.current.affectedIndicators)], ['Affected dependencies', String(r.current.affectedDependencies)]]} />
    {!!evaluated.length && <><SectionTitle>Indicators & dependencies</SectionTitle>{evaluated.map((component, index) => <Pressable key={`${component.key}-${index}`} accessibilityRole={component.sourceID ? 'button' : undefined} disabled={!component.sourceID} onPress={() => router.push({ pathname: '/status/[view]/[id]', params: { view: component.kind === 'target' ? 'targets' : 'monitors', id: component.sourceID } } as Href)}><Card><View style={{ flexDirection: 'row', gap: spacing.md }}><Text style={[typography.cardTitle, { flex: 1, color: colors.ink }]}>{component.name}</Text><StatusPill status={component.state} /></View>{component.collectionState !== 'active' && !!component.collectionState && <Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.xs }]}>{collectionLabel(component.collectionState)}</Text>}{!!component.reason && <Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.xs }]}>{component.reason}</Text>}</Card></Pressable>)}</>}
    <ServiceIncidents id={id} />
  </>;
}

type ServiceIncidentPage = { incidents: Incident[]; total: number };
const serviceIncidents = (page: ServiceIncidentPage) => page.incidents;
const incidentTotal = (page: ServiceIncidentPage) => page.total;
function ServiceIncidents({ id }: { id: string }) {
  const path = useCallback((offset: number, limit: number) => `/v2/services/${encodeURIComponent(id)}/incidents?offset=${offset}&limit=${limit}`, [id]);
  const result = usePaginatedApi<ServiceIncidentPage, Incident>({ path, items: serviceIncidents, total: incidentTotal, pageSize: 10 });
  useForegroundRefresh(result.refreshVisible);
  return <><State compact loading={result.loading} loadingMessage="Loading service incidents…" error={result.error} onRetry={result.reload} /><IncidentRows incidents={result.records} />{result.hasMore && <Button variant="secondary" label="More incidents" onPress={result.loadMore} busy={result.loadingMore} />}</>;
}
