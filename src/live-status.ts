import { monitorMeasurement, monitorProtocolLabel } from './monitor-display.ts';
import { monitorReportPath } from './report-routing.ts';
import type { Monitor, MonitorPage, ServiceStatus, ServiceStatusPage, TargetStatus, TargetStatusPage } from './types';
import type { StatusView } from './status-view';

export type LiveStatusCard = { id: string; label: string; subtitle: string; status: string; kind: string; measurement: string; detailView: StatusView; detailId: string; reportPath?: string; note?: string };
export type LiveStatusPage = MonitorPage | TargetStatusPage | ServiceStatusPage;

export function statusFilters(view: StatusView) {
  if (view === 'targets') return ['All', 'Down', 'Affected', 'Healthy', 'Unknown'];
  if (view === 'services') return ['All', 'Down', 'Degraded', 'Healthy', 'Unknown'];
  return ['All', 'Down', 'Attention', 'Up', 'Unknown'];
}

export function statusFilterCounts(view: StatusView, page?: LiveStatusPage | null): Record<string, number> | undefined {
  if (!page?.summary) return undefined;
  const counts = statusCounts(view, page);
  return {
    All: counts.total,
    Down: counts.down,
    [view === 'monitors' ? 'Attention' : view === 'targets' ? 'Affected' : 'Degraded']: counts.attention,
    [view === 'monitors' ? 'Up' : 'Healthy']: counts.healthy,
    Unknown: counts.unknown,
  };
}

export function liveStatusPath(view: StatusView, offset: number, limit: number, filter: string, search: string) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (filter !== 'All') params.set('status', filter.toLowerCase());
  if (search) params.set('search', search);
  return `/v2/status/${view}?${params}`;
}

export function monitorCard(monitor: Monitor): LiveStatusCard {
  const reportPath = monitorReportPath(monitor);
  return { id: monitor.monitorID || monitor.ID, label: monitor.label, subtitle: monitor.host || monitor.monitorLabel,
    status: monitor.status, kind: monitorProtocolLabel(monitor), measurement: monitorMeasurement(monitor),
    detailView: reportPath ? 'monitors' : 'targets', detailId: reportPath ? monitor.monitorID || monitor.ID : monitor.targetID, ...(reportPath ? { reportPath } : {}) };
}

export function targetCard(target: TargetStatus): LiveStatusCard {
  return { id: target.targetID || target.ID, label: target.label, subtitle: target.address || target.statusMessage,
    status: target.status, kind: `${target.monitorCount} monitor${target.monitorCount === 1 ? '' : 's'}`,
    measurement: target.statusMessage || target.status, detailView: 'targets', detailId: target.targetID || target.ID };
}

export function serviceCard(service: ServiceStatus): LiveStatusCard {
  return { id: service.serviceID || service.ID, label: service.label, subtitle: service.statusMessage || service.probableCause || service.customerImpact || 'No customer impact',
    status: service.status, kind: service.monitoringLimited ? 'Monitoring limited' : service.metric?.caption || 'Service health',
    measurement: service.metric?.label || '—', detailView: 'services', detailId: service.serviceID || service.ID,
    note: service.metric?.coverage?.unknownSeconds ? 'Partial monitoring data' : undefined };
}

export function cardsForPage(view: StatusView, page: LiveStatusPage): LiveStatusCard[] {
  if (view === 'targets') return (page as TargetStatusPage).records.map(targetCard);
  if (view === 'services') return (page as ServiceStatusPage).records.map(serviceCard);
  return (page as MonitorPage).records.map(monitorCard);
}

export function statusCounts(view: StatusView, page?: LiveStatusPage | null) {
  if (view === 'targets') {
    const counts = (page as TargetStatusPage | null)?.summary;
    return { total: counts?.totalTargets ?? 0, healthy: counts?.healthyTargets ?? 0, down: counts?.downTargets ?? 0, attention: counts?.affectedTargets ?? 0, unknown: counts?.unknownTargets ?? 0 };
  }
  if (view === 'services') {
    const counts = (page as ServiceStatusPage | null)?.summary;
    return { total: counts?.totalServices ?? 0, healthy: counts?.healthyServices ?? 0, down: counts?.downServices ?? 0, attention: counts?.degradedServices ?? 0, unknown: counts?.unknownServices ?? 0 };
  }
  const counts = (page as MonitorPage | null)?.summary;
  return { total: counts?.totalMonitors ?? 0, healthy: counts?.upMonitors ?? 0, down: counts?.downMonitors ?? 0, attention: counts?.attentionMonitors ?? 0, unknown: counts?.unknownMonitors ?? 0 };
}
