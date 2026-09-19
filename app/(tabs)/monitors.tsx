import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, FilterBar, ListFooter, PageTitle, SearchField, State, StatusIndicator, useResponsiveLayout } from '@/components';
import { monitorMeasurement, monitorProtocolLabel } from '@/monitor-display';
import { layout, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { Monitor, MonitorPage } from '@/types';
import { useDebouncedValue, usePaginatedApi } from '@/use-paginated-api';

const filters = ['All', 'Down', 'Attention', 'Up', 'Unknown'];
const pageItems = (page: MonitorPage) => page.records;
const pageTotal = (page: MonitorPage) => page.total;

export default function Monitors() {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const pagePath = useCallback((offset: number, limit: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (filter !== 'All') params.set('status', filter.toLowerCase());
    if (debouncedSearch) params.set('search', debouncedSearch);
    return `/v2/status/monitors?${params}`;
  }, [debouncedSearch, filter]);
  const result = usePaginatedApi<MonitorPage, Monitor>({ path: pagePath, items: pageItems, total: pageTotal });

  const header = <View style={styles.header}>
    <PageTitle eyebrow="LIVE ENVIRONMENT" title="Monitors" detail={`${result.total || 'Every'} check${result.total === 1 ? '' : 's'}, in one glance.`} />
    <SearchField value={search} onChangeText={setSearch} placeholder="Search monitors" />
    <FilterBar options={filters} value={filter} onChange={setFilter} label="Monitor status" />
  </View>;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <FlatList
      key={responsive.columns}
      data={result.records}
      numColumns={responsive.columns}
      keyExtractor={(monitor) => monitor.monitorID ?? monitor.ID}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
      columnWrapperStyle={responsive.columns > 1 ? styles.columns : undefined}
      ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={<State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !result.error ? 'No monitors match this view.' : undefined} />}
      ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : null}
      renderItem={({ item }) => <View style={responsive.columns > 1 ? styles.column : undefined}><MonitorCard monitor={item} /></View>}
      refreshing={result.refreshing}
      onRefresh={result.reload}
      onEndReached={result.loadMore}
      onEndReachedThreshold={.45}
      keyboardShouldPersistTaps="handled"
    />
  </SafeAreaView>;
}

function MonitorCard({ monitor }: { monitor: Monitor }) {
  const { colors } = useV2Theme();
  const protocol = monitorProtocolLabel(monitor);
  const measurement = monitorMeasurement(monitor);
  return <Card style={styles.card} accessibilityLabel={`${monitor.label}, ${monitor.host}, ${protocol}, ${monitor.status}, ${measurement}`}>
    <View style={styles.cardTop}><View style={styles.cardIdentity}><Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{monitor.label}</Text><Text numberOfLines={1} style={[styles.host, { color: colors.muted }]}>{monitor.host || monitor.monitorLabel}</Text></View><StatusIndicator status={monitor.status} size={13} /></View>
    <View style={styles.cardBottom}><Text numberOfLines={1} style={[styles.protocol, { color: colors.muted }]}>{protocol}</Text><Text numberOfLines={1} style={[styles.measurement, { color: colors.muted }]}>{measurement}</Text></View>
  </Card>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: spacing.md },
  headerSpacing: { marginBottom: spacing.lg },
  columns: { gap: layout.listGap },
  column: { flex: 1 },
  card: { minHeight: 112, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardIdentity: { flex: 1 },
  name: typography.cardTitle,
  host: { ...typography.metadata, marginTop: spacing.xs },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  protocol: { ...typography.metadata, flex: 1 },
  measurement: { ...typography.metadata, textAlign: 'right', maxWidth: '48%' },
});
