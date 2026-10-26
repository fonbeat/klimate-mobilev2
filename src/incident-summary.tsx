import { DetailCard, formatDate, Notice, ReportHeader } from './report-components';
import { incidentResourceLabel, type IncidentDetails } from './incident-presentation';

export function IncidentSummary({ report }: { report: IncidentDetails }) {
  const incident = report.incident;
  const name = incident.serviceName || incident.label || incident.monitorLabel || 'Incident';
  return <>
    <ReportHeader title={name} subtitle={`${incidentResourceLabel(incident)} event`} status={incident.status} domain="incident" message={incident.rootCause || 'No event summary was supplied.'} />
    <DetailCard rows={[
      ['Affected resource', name],
      ['Monitor', incident.monitorLabel && incident.monitorLabel !== name ? incident.monitorLabel : undefined],
      ['Severity', incident.severity || 'Not supplied'],
      ['Started', formatDate(report.startedAt || incident.startedAt)],
      ['Duration', incident.duration || '—'],
      ['Closed', report.resolvedAt ? formatDate(report.resolvedAt) : 'Still open'],
    ]} />
    {!!report.recovery && <Notice>{report.recovery}</Notice>}
  </>;
}
