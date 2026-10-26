import type { Incident, Monitor } from './types';

// Report paths remain API-local and read-only, even when provided by navigation params.
export function validReportPath(path?: string) {
  if (!path || !/^\/(?:v2\/(?:monitors\/[^/?#]+\/(?:uptime|path|interface|host|server)|snmp\/endpoints\/[^/?#]+\/report|flow\/exporters\/[^/?#]+\/report|syslog\/sources\/[^/?#]+\/report)|v3\/monitors\/[^/?#]+\/winrm)$/.test(path)) return false;
  try { return path.split('/').every((part) => { const decoded = decodeURIComponent(part); return decoded !== '..' && decoded !== '.' && !/[\\/?#]/.test(decoded); }); }
  catch { return false; }
}

export function canonicalReportPath(path: string) {
  return validReportPath(path) ? path.replace(/^(\/v2\/monitors\/[^/]+)\/server$/, '$1/host') : undefined;
}

export function isDirectMonitorReport(type?: string) {
  return ['PATH', 'HOST', 'SERVER', 'WINRM'].includes(type?.toUpperCase() ?? '');
}

export function monitorReportPath(monitor: Pick<Monitor, 'type' | 'monitorID' | 'snmp' | 'flow' | 'syslog' | 'liveMetric'>) {
  const id = monitor.monitorID ? encodeURIComponent(monitor.monitorID) : '';
  switch (monitor.type.toUpperCase()) {
    case 'PATH': return id ? `/v2/monitors/${id}/path` : undefined;
    case 'HOST': case 'SERVER': return id ? `/v2/monitors/${id}/host` : undefined;
    case 'WINRM': return id ? `/v3/monitors/${id}/winrm` : undefined;
    case 'SNMP':
      if (id && monitor.liveMetric?.kind === 'interface_throughput') return `/v2/monitors/${id}/interface`;
      if (monitor.snmp?.endpointID) return `/v2/snmp/endpoints/${encodeURIComponent(monitor.snmp.endpointID)}/report`;
      break;
    case 'FLOW': return monitor.flow?.exporterID ? `/v2/flow/exporters/${encodeURIComponent(monitor.flow.exporterID)}/report` : undefined;
    case 'SYSLOG': return monitor.syslog?.sourceID ? `/v2/syslog/sources/${encodeURIComponent(monitor.syslog.sourceID)}/report` : undefined;
  }
  return id ? `/v2/monitors/${id}/uptime` : undefined;
}

export function incidentDestination(incident: Incident) {
  if (incident.id) return { pathname: '/incident/[id]', params: { id: incident.id } };
  if (incident.kind === 'probe' && incident.probeID) return { pathname: '/probe/[id]', params: { id: incident.probeID } };
  if (incident.kind === 'service' && incident.serviceID) return { pathname: '/status/[view]/[id]', params: { view: 'services', id: incident.serviceID } };
  if (incident.monitorID) return { pathname: '/status/[view]/[id]', params: { view: 'monitors', id: incident.monitorID } };
  if (incident.targetID) return { pathname: '/status/[view]/[id]', params: { view: 'targets', id: incident.targetID } };
  return undefined;
}
