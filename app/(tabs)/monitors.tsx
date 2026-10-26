import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useCapabilities } from '@/capabilities';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, FilterBar, ListFooter, PageTitle, RefreshWarning, SearchField, State, StatusIndicator, useResponsiveLayout } from '@/components';
import { cardsForPage, liveStatusPath, statusFilters, type LiveStatusCard, type LiveStatusPage } from '@/live-status';
import { useStatusView, statusViewLabel, statusViews, type StatusView } from '@/status-view';
import { layout, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import { useDebouncedValue, usePaginatedApi } from '@/use-paginated-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { SwipeTab } from '@/swipe-tabs';

const pageTotal = (page: LiveStatusPage) => page.total;

export default function LiveStatus() {
  const { activeView, setActiveView } = useStatusView();
  const { servicesEnabled } = useCapabilities();
  const effectiveView = activeView === 'services' && !servicesEnabled ? 'monitors' : activeView;
  useEffect(() => { if (effectiveView !== activeView) setActiveView(effectiveView); }, [activeView, effectiveView, setActiveView]);
  return <LiveStatusForView key={effectiveView} activeView={effectiveView} setActiveView={setActiveView} />;
}

function LiveStatusForView({ activeView, setActiveView }: { activeView: StatusView; setActiveView: (view: StatusView) => void }) {
  const { statusFilter } = useLocalSearchParams<{ statusFilter?: string }>();
  const { colors } = useV2Theme();
  const capabilities = useCapabilities();
  const responsive = useResponsiveLayout();
  const [filter, setFilter] = useState(statusFilter === 'Down' || statusFilter === 'Attention' ? statusFilter : 'All');
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (activeView !== 'monitors' || (statusFilter !== 'Down' && statusFilter !== 'Attention')) return;
    setFilter(statusFilter);
    setSearch('');
    // Consume the shortcut so later manual filter/view changes remain untouched.
    router.setParams({ statusFilter: undefined });
  }, [activeView, statusFilter]);
  const debouncedSearch = useDebouncedValue(search.trim());
  const changeView = setActiveView;
  const pagePath = useCallback((offset: number, limit: number) => liveStatusPath(activeView, offset, limit, filter, debouncedSearch), [activeView, debouncedSearch, filter]);
  const pageItems = useCallback((page: LiveStatusPage): LiveStatusCard[] => cardsForPage(activeView, page), [activeView]);
  const result = usePaginatedApi<LiveStatusPage, LiveStatusCard>({ path: pagePath, items: pageItems, total: pageTotal, enabled: activeView !== 'services' || !capabilities.loading });
  useForegroundRefresh(() => { void capabilities.reload(); void result.refreshVisible(); });

  const header = <View style={styles.header}>
    <PageTitle eyebrow="" title="Status" detail={`${statusViewLabel(activeView)} across your organization`} />
    <FilterBar options={statusViews.filter((view) => view !== 'services' || capabilities.servicesEnabled).map(statusViewLabel)} value={statusViewLabel(activeView)} onChange={(label) => changeView(statusViews.find((view) => statusViewLabel(view) === label) ?? 'monitors')} label="Live status view" />
    <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${activeView}`} />
    <FilterBar options={statusFilters(activeView)} value={filter} onChange={setFilter} label={`${statusViewLabel(activeView)} status`} />
    {!!result.records.length && <RefreshWarning error={result.error} />}
  </View>;

  return <SwipeTab current="status"><SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <FlatList
      key={responsive.columns}
      data={result.records}
      numColumns={responsive.columns}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
      columnWrapperStyle={responsive.columns > 1 ? styles.columns : undefined}
      ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={<State loading={result.loading || (activeView === 'services' && capabilities.loading)} loadingMessage={`Loading ${activeView}…`} error={result.error} onRetry={result.reload} empty={!result.loading && !result.error && !(activeView === 'services' && capabilities.loading) ? `No ${activeView} match this view.` : undefined} />}
      ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : undefined}
      renderItem={({ item }) => <View style={responsive.columns > 1 ? styles.column : undefined}><LiveCard item={item} /></View>}
      refreshing={result.refreshing}
      onRefresh={result.reload}
      onEndReached={result.loadMore}
      onEndReachedThreshold={.45}
      keyboardShouldPersistTaps="handled"
    />
  </SafeAreaView></SwipeTab>;
}

function LiveCard({ item }: { item: LiveStatusCard }) {
  const { colors } = useV2Theme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.label}, ${item.status}`} onPress={() => router.push({ pathname: '/status/[view]/[id]', params: { view: item.detailView, id: item.detailId, ...(item.reportPath ? { reportPath: item.reportPath } : {}) } } as unknown as Href)} style={({ pressed }) => pressed && styles.pressed}><Card style={styles.card} accessibilityLabel={`${item.label}, ${item.subtitle}, ${item.status}, ${item.kind}, ${item.measurement}`}>
    <View style={styles.cardTop}><View style={styles.cardIdentity}><Text numberOfLines={2} style={[styles.name, { color: colors.ink }]}>{item.label}</Text><Text numberOfLines={1} style={[styles.host, { color: colors.muted }]}>{item.subtitle}</Text></View><View style={styles.statusGroup}><StatusIndicator status={item.status} size={9} /><Text style={[styles.status, { color: colors.ink }]}>{item.status}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} /></View>
    <View style={styles.cardBottom}><Text numberOfLines={1} style={[styles.protocol, { color: colors.muted }]}>{item.kind}</Text><Text numberOfLines={1} style={[styles.measurement, { color: colors.ink }]}>{item.measurement}</Text></View>
    {!!item.note && <Text style={[styles.host, { color: colors.muted }]}>{item.note}</Text>}
  </Card></Pressable>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: spacing.md },
  headerSpacing: { marginBottom: spacing.md },
  columns: { gap: layout.listGap },
  column: { flex: 1 },
  card: { minHeight: 88, justifyContent: 'space-between', paddingVertical: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIdentity: { flex: 1 },
  name: typography.cardTitle,
  host: { ...typography.metadata, marginTop: spacing.xs },
  status: { ...typography.metadata, fontWeight: '600', textTransform: 'capitalize' },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  protocol: { ...typography.metadata, flex: 1 },
  measurement: { ...typography.metadata, fontWeight: '600', textAlign: 'right', maxWidth: '48%' },
  pressed: { opacity: .72 },
});
