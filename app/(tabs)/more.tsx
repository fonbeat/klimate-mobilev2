import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, FilterBar, ListFooter, RefreshWarning, PageTitle, SearchField, State, StatusPill, useResponsiveLayout } from '@/components';
import { layout, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { Probe, ProbeView } from '@/types';
import { useDebouncedValue, usePaginatedApi } from '@/use-paginated-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { SwipeTab } from '@/swipe-tabs';

const pageItems = (page: ProbeView) => page.probes;
const pageTotal = (page: ProbeView) => page.total;

export default function More() {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const query = useDebouncedValue(search.trim());
  const path = useCallback((offset: number, limit: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (query) params.set('q', query);
    if (filter !== 'All') params.set('status', filter.toLowerCase());
    return `/v2/gateways?${params}`;
  }, [query, filter]);
  const result = usePaginatedApi<ProbeView, Probe>({ path, items: pageItems, total: pageTotal, pageSize: 24 });
  useForegroundRefresh(result.refreshVisible);
  return <SwipeTab current="more"><SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><FlatList
    key={responsive.columns} data={result.records} numColumns={responsive.columns} keyExtractor={(gateway) => gateway.id}
    contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && { flexGrow: 1 }]}
    columnWrapperStyle={responsive.columns > 1 ? { gap: layout.listGap } : undefined}
    ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
    ListHeaderComponent={<View style={styles.header}><PageTitle eyebrow="" title="Gateways" detail="Your environment’s data collectors" /><SearchField value={search} onChangeText={setSearch} placeholder="Search Gateways" /><FilterBar options={['All', 'Online', 'Offline']} value={filter} onChange={setFilter} label="Gateway status" />{!!result.records.length && <RefreshWarning error={result.error} />}</View>}
    ListHeaderComponentStyle={{ marginBottom: spacing.lg }}
    ListEmptyComponent={<State loading={result.loading} loadingMessage="Loading Gateways…" error={result.error} onRetry={result.reload} empty={!result.loading && !result.error ? 'No Gateways match this view.' : undefined} />}
    ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : undefined}
    renderItem={({ item }) => <View style={responsive.columns > 1 ? { flex: 1 } : undefined}><Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}, ${item.status}`} onPress={() => router.push({ pathname: '/probe/[id]', params: { id: item.id } } as unknown as Href)} style={({ pressed }) => pressed && { opacity: .72 }}><Card style={styles.card}><View style={styles.row}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.ink }]}>{item.name}</Text><Text style={[styles.metadata, { color: colors.muted }]}>{item.location || item.privateIp}</Text></View><StatusPill status={item.status} domain="probe" /></View><View style={styles.footer}><Text style={[styles.metadata, { color: colors.muted }]}>{item.assignedWork.targetCount} targets · {item.assignedWork.monitorCount} monitors</Text><Text style={[styles.metadata, { color: colors.muted }]}>{item.lastSeen}</Text></View></Card></Pressable></View>}
    refreshing={result.refreshing} onRefresh={result.reload} onEndReached={result.loadMore} onEndReachedThreshold={.45} keyboardShouldPersistTaps="handled"
  /></SafeAreaView></SwipeTab>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  header: { gap: spacing.md }, card: { minHeight: 100, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  title: typography.cardTitle, metadata: { ...typography.metadata, marginTop: spacing.xs },
});
