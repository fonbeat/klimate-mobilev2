import { Pressable, Text, View } from 'react-native';
import { Button, Card, SectionTitle, StatusPill, SummaryStrip } from './components';
import { DetailCard, formatDate, Notice, ReportHeader } from './report-components';
import { cloudResponse, databaseEngineLabel, databaseFresh, databaseMetricName, databaseValue, milliseconds, type CloudReport, type DatabaseReport } from './new-monitor-reports';
import { useV2Theme } from './theme';
import { spacing, typography } from './tokens';

export function CloudDetail({ report: r, locationId, onLocation }: { report: CloudReport; locationId: string; onLocation: (id: string) => void }) {
  const { colors } = useV2Theme();
  const selected = r.locations.find((location) => location.id === locationId);
  return <>
    <ReportHeader title={r.monitor.name} subtitle={`Cloud · ${r.targetName}`} status={r.collectionEnabled ? r.summary.state : 'Unknown'} message={r.collectionEnabled ? 'HTTP availability from Klimate-managed locations' : 'Cloud collection is paused or unavailable. Retained checks are not current health.'} />
    <SummaryStrip items={[{ label: 'Healthy', value: r.summary.healthyLocations, tone: 'positive' }, { label: 'Failed', value: r.summary.failedLocations, tone: 'critical' }, { label: 'Unknown', value: r.summary.unknownLocations }]} />
    <DetailCard rows={[[ 'Address', r.monitor.config.url ], ['Method', r.monitor.config.method], ['Mean response · healthy locations', milliseconds(r.summary.meanResponseMs)], ['Median response · healthy locations', milliseconds(r.summary.medianResponseMs)], ['Updated', formatDate(r.generatedAt)]]} />
    <SectionTitle>Locations</SectionTitle>
    <Notice>Location readiness describes the checking infrastructure, not whether your endpoint is healthy. Unknown or missing results are not outages or successful checks.</Notice>
    <Button label={selected ? `Showing ${selected.name} · show all locations` : 'All locations selected'} variant="secondary" onPress={() => onLocation('')} />
    {r.locations.map((location) => {
      const infrastructure = r.mapLocations?.find((entry) => entry.id === location.id);
      const latest = location.latest;
      const readiness = infrastructure?.readiness === 'online' ? 'Online' : infrastructure?.readiness === 'offline' ? 'Offline' : infrastructure?.readiness === 'no_agents' ? 'No enabled agents' : infrastructure?.readiness === 'disabled' ? 'Disabled' : 'Unavailable';
      return <Pressable key={location.id} accessibilityRole="button" accessibilityState={{ selected: location.id === locationId }} accessibilityLabel={`Show checks from ${location.name}`} onPress={() => onLocation(location.id === locationId ? '' : location.id)}>
        <Card><View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}><Text style={[typography.cardTitle, { flex: 1, color: colors.ink }]}>{location.name}</Text><StatusPill status={r.collectionEnabled && location.available ? location.state : 'Unknown'} /></View>
          <Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.sm }]}>{cloudResponse(latest, r.collectionEnabled && location.available ? location.state : 'Unknown')} · {infrastructure?.country || 'Klimate Cloud'}</Text>
          <Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.xs }]}>Location readiness: {readiness}</Text>
          <Text style={[typography.metadata, { color: colors.muted, marginTop: spacing.xs }]}>Latest check: {latest ? formatDate(latest.scheduledAt) : 'N/A'}</Text>
        </Card>
      </Pressable>;
    })}
    <SectionTitle>{selected ? `Recent checks · ${selected.name}` : 'Recent checks · all locations'}</SectionTitle>
    {!r.items.length && <Notice>No checks were returned for this period and location.</Notice>}
    {r.items.slice(0, 5).map((run) => <DetailCard key={run.id} rows={[[r.locations.find((entry) => entry.id === run.locationId)?.name || run.locationId, `${run.state}${run.historical ? ' · historical' : ''}`], ['Scheduled', formatDate(run.scheduledAt)], ['Response', cloudResponse(run)], ['HTTP', run.statusCode ? String(run.statusCode) : 'N/A'], ['DNS / connect / TLS', `${milliseconds(run.dnsMs)} / ${milliseconds(run.connectMs)} / ${milliseconds(run.tlsMs)}`], ['Result', run.reason?.replace(/_/g, ' ')]]} />)}
    {r.total > 5 && <Notice>Showing the latest five checks for this selection. Full history and diagnostics are available in Klimate on the web.</Notice>}
  </>;
}

export function DatabaseDetail({ report: r }: { report: DatabaseReport }) {
  const fresh = databaseFresh(r);
  const state = !fresh && r.status.toLowerCase() === 'up' ? 'Unknown' : r.status;
  const readings = r.latest.slice(0, 8);
  return <>
    <ReportHeader title={r.targetName || r.source.database || 'Database'} subtitle={`Database · ${databaseEngineLabel(r.source.engine)}`} status={state} message={r.alert.reason || r.scrapeReason || 'Database engine monitoring'} />
    <DetailCard rows={[[ 'Endpoint', r.source.endpoint ], ['Database', r.source.database || 'Instance-level metrics'], ['Gateway', r.gatewayName || 'N/A'], ['Collection', r.collectionState.replace(/_/g, ' ')], ['Scrape', r.scrapeState || 'Unavailable'], ['Last received', formatDate(r.source.lastSeen)]]} />
    {!fresh && <Notice>Collection is incomplete, paused or stale. Retained measurements are historical context, not proof of current health or a database outage.</Notice>}
    {!!r.scrapeReason && <Notice>{r.scrapeReason}</Notice>}
    <SectionTitle>{fresh ? 'Engine measurements' : 'Last available measurements'}</SectionTitle>
    {!readings.length && <Notice>No database engine measurements are available.</Notice>}
    {readings.map((metric) => <DetailCard key={metric.key} rows={[[databaseMetricName(metric), databaseValue(metric)], ['Measured', formatDate(metric.at)]]} />)}
    {r.latest.length > 8 && <Notice>Showing eight engine measurements. Full metric history and alert configuration remain available on the web.</Notice>}
    <DetailCard rows={[[ 'Threshold alerts', r.alert.enabled ? 'Enabled' : 'Not enabled'], ['Alert state', r.alert.state], ['Open incidents', r.openIncidents == null ? 'N/A' : String(r.openIncidents)]]} />
  </>;
}
