import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, FilterBar, ListFooter, PageTitle, State, StatusIndicator, useResponsiveLayout } from '@/components';
import { layout, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { Incident, IncidentPage } from '@/types';
import { usePaginatedApi } from '@/use-paginated-api';

const filters = ['All', 'Pending', 'Acknowledged', 'Resolved'];
const pageItems = (page: IncidentPage) => page.incidents;
const pageTotal = (page: IncidentPage) => page.total;

export default function Incidents() {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const [filter, setFilter] = useState('All');
  const pagePath = useCallback((offset: number, pageSize: number) => {
    const page = Math.floor(offset / pageSize) + 1;
    const status = filter === 'All' ? '' : `&status=${encodeURIComponent(filter.toLowerCase())}`;
    return `/v2/incidents?page=${page}&pageSize=${pageSize}${status}`;
  }, [filter]);
  const result = usePaginatedApi<IncidentPage, Incident>({ path: pagePath, items: pageItems, total: pageTotal, pageSize: 24 });

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <FlatList
      key={responsive.columns}
      data={result.records}
      numColumns={responsive.columns}
      keyExtractor={(incident) => incident.id}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
      columnWrapperStyle={responsive.columns > 1 ? styles.columns : undefined}
      ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
      ListHeaderComponent={<View style={styles.header}><PageTitle eyebrow="EVENT HISTORY" title="Incidents" detail={`${result.total || 'Recent'} outage${result.total === 1 ? '' : 's'} and recoveries across your monitors.`} /><FilterBar options={filters} value={filter} onChange={setFilter} label="Incident status" /></View>}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={<State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !result.error ? 'No incidents in this view.' : undefined} />}
      ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : null}
      renderItem={({ item }) => <View style={responsive.columns > 1 ? styles.column : undefined}><IncidentCard incident={item} /></View>}
      refreshing={result.refreshing}
      onRefresh={result.reload}
      onEndReached={result.loadMore}
      onEndReachedThreshold={.45}
    />
  </SafeAreaView>;
}

function IncidentCard({ incident }: { incident: Incident }) {
  const { colors } = useV2Theme();
  return <Card style={styles.card} accessibilityLabel={`${incident.label}, ${incident.status}, ${incident.rootCause}`}>
    <View style={styles.identity}><StatusIndicator status={incident.status} domain="incident" /><View style={styles.flex}><Text style={[styles.name, { color: colors.ink }]}>{incident.label}</Text><Text style={[styles.monitor, { color: colors.muted }]}>{incident.monitorLabel} · {incident.type}</Text></View><Text style={[styles.status, { color: colors.muted }]}>{incident.status}</Text></View>
    <Text style={[styles.cause, { color: colors.ink, borderTopColor: colors.line }]}>{incident.rootCause}</Text>
    {!!incident.acknowledgedBy && <Text style={[styles.acknowledgement, { color: colors.attention }]}>Acknowledged by {incident.acknowledgedBy}</Text>}
    <View style={styles.time}><Text style={[styles.metadata, { color: colors.muted }]}>{incident.startedAt}</Text><Text style={[styles.duration, { color: colors.ink }]}>{incident.duration}</Text></View>
  </Card>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: spacing.md },
  headerSpacing: { marginBottom: spacing.lg },
  columns: { gap: layout.listGap },
  column: { flex: 1 },
  card: { minHeight: 180 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  name: typography.cardTitle,
  monitor: { ...typography.metadata, marginTop: spacing.xs, textTransform: 'uppercase' },
  status: { ...typography.metadata, textTransform: 'capitalize' },
  cause: { ...typography.body, paddingTop: spacing.md, marginTop: spacing.md, borderTopWidth: 1 },
  acknowledgement: { ...typography.metadata, marginTop: spacing.sm },
  time: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginTop: 'auto', paddingTop: spacing.md },
  metadata: typography.metadata,
  duration: { ...typography.metadata, fontWeight: '600' },
});
