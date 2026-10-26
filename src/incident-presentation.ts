import type { Incident } from './types';

export function incidentResourceLabel(incident: Pick<Incident, 'kind'>) {
  return incident.kind === 'apm' ? 'Application' : incident.kind === 'probe' ? 'Gateway' : incident.kind === 'service' ? 'Service' : 'Monitor';
}

// Only the summary fields are consumed. Investigation and operational controls
// intentionally remain in the web portal.
export type IncidentDetails = {
  incident: Incident;
  startedAt: string;
  resolvedAt: string | null;
  recovery: string;
};
