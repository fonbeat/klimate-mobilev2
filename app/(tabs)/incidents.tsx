import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, FilterBar, ListFooter, RefreshWarning, PageTitle, State, StatusPill, useResponsiveLayout } from '@/components';
import { layout, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { Incident, IncidentPage } from '@/types';
import { usePaginatedApi } from '@/use-paginated-api';
import { SwipeTab } from '@/swipe-tabs';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { incidentDestination } from '@/report-routing';
import { formatDate } from '@/report-components';
import { incidentResourceLabel } from '@/incident-presentation';

const filters = ['All', 'Pending', 'Acknowledged', 'Resolved'];
const pageItems = (page: IncidentPage) => page.incidents;
const pageTotal = (page: IncidentPage) => page.total;

export default function Incidents() {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const [filter, setFilter] = useState('All');
  const params = useLocalSearchParams<{ kind?: string; probeId?: string }>();
  const kinds: Record<string, string> = { All: '', Monitors: 'monitor', Services: 'service', Applications: 'apm', Gateways: 'probe' };
  const kind = Object.values(kinds).includes(params.kind ?? '') ? params.kind ?? '' : '';
  const pagePath = useCallback((offset: number, pageSize: number) => {
    const page = Math.floor(offset / pageSize) + 1;
    const status = filter === 'All' ? '' : `&status=${encodeURIComponent(filter.toLowerCase())}`;
    const resource = kind ? `&kind=${kind}` : '';
    const gateway = kind === 'probe' && params.probeId ? `&probeId=${encodeURIComponent(params.probeId)}` : '';
    return `/v2/incidents?page=${page}&pageSize=${pageSize}${status}${resource}${gateway}`;
  }, [filter, kind, params.probeId]);
  const result = usePaginatedApi<IncidentPage, Incident>({ path: pagePath, items: pageItems, total: pageTotal, pageSize: 24 });
  useForegroundRefresh(result.refreshVisible);

  return <SwipeTab current="incidents"><SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <FlatList onViewableItemsChanged={result.onViewableItemsChanged}
      key={responsive.columns}
      data={result.records}
      numColumns={responsive.columns}
      keyExtractor={(incident) => incident.id}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
      columnWrapperStyle={responsive.columns > 1 ? styles.columns : undefined}
      ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
      ListHeaderComponent={<View style={styles.header}><PageTitle eyebrow="" title="Incidents" detail={kind === 'probe' && params.probeId ? 'Events for this Gateway' : 'Monitor, service, and Gateway events'} /><FilterBar options={Object.keys(kinds)} value={Object.keys(kinds).find((label) => kinds[label] === kind) ?? 'All'} onChange={(value) => router.setParams({ kind: kinds[value], probeId: undefined })} label="Incident resource" /><FilterBar options={filters} value={filter} onChange={setFilter} label="Incident status" />{!!result.records.length && <RefreshWarning error={result.error} />}</View>}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={<State loading={result.loading} loadingMessage="Loading incidents…" error={result.error} onRetry={result.reload} empty={!result.loading && !result.error ? 'No incidents in this view.' : undefined} />}
      ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : undefined}
      renderItem={({ item }) => <View style={responsive.columns > 1 ? styles.column : undefined}><IncidentCard incident={item} /></View>}
      refreshing={result.refreshing}
      onRefresh={result.reload}
      onEndReached={result.loadMore}
      onEndReachedThreshold={.45}
    />
  </SafeAreaView></SwipeTab>;
}

function IncidentCard({ incident }: { incident: Incident }) {
  const { colors } = useV2Theme();
  const destination = incidentDestination(incident);
  const resource = incidentResourceLabel(incident);
  return <Pressable accessibilityRole={destination ? 'button' : undefined} disabled={!destination} onPress={() => destination && router.push(destination as Href)}><Card style={styles.card} accessibilityLabel={`${incident.label}, ${incident.status}, ${incident.rootCause}`}>
    <View style={styles.identity}><View style={styles.flex}><Text style={[styles.name, { color: colors.ink }]}>{incident.serviceName || incident.label}</Text><Text style={[styles.monitor, { color: colors.muted }]}>{resource} · {incident.kind === 'probe' ? 'Connectivity' : incident.monitorLabel || incident.type}</Text></View><StatusPill status={incident.status} domain="incident" /></View>
    {!!incident.severity && <View style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}><StatusPill status={incident.severity} domain="attention" /></View>}
    {!!incident.rootCause && <Text style={[styles.cause, { color: colors.ink }]}>{incident.rootCause}</Text>}
    {!!incident.acknowledgedBy && <Text style={[styles.acknowledgement, { color: colors.attention }]}>Acknowledged by {incident.acknowledgedBy}</Text>}
    <View style={[styles.time, { borderTopColor: colors.line }]}><Text style={[styles.metadata, { color: colors.muted }]}>{formatDate(incident.startedAt)}</Text><Text style={[styles.duration, { color: colors.muted }]}>{incident.duration}</Text></View>
  </Card></Pressable>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: spacing.md },
  headerSpacing: { marginBottom: spacing.md },
  columns: { gap: layout.listGap },
  column: { flex: 1 },
  card: { minHeight: 116 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  name: typography.cardTitle,
  monitor: { ...typography.metadata, marginTop: spacing.xs },
  cause: { ...typography.body, marginTop: spacing.md },
  acknowledgement: { ...typography.metadata, marginTop: spacing.sm },
  time: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  metadata: typography.metadata,
  duration: { ...typography.metadata, fontWeight: '600' },
});
