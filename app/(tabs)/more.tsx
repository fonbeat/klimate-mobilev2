import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, FilterBar, ListFooter, Page, PageTitle, SearchField, SectionTitle, State, StatusIndicator, useResponsiveLayout } from '@/components';
import { layout, radii, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { MaintenanceView, Probe, ProbeView } from '@/types';
import { useApiData } from '@/use-api';
import { useDebouncedValue, usePaginatedApi } from '@/use-paginated-api';

type Section = 'maintenance' | 'probes';
const probeItems = (page: ProbeView) => page.probes;
const probeTotal = (page: ProbeView) => page.total;

export default function More() {
  const { colors } = useV2Theme();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(params.section === 'probes' ? 'probes' : 'maintenance');
  const maintenance = useApiData<MaintenanceView>('/v2/maintenance', section === 'maintenance');
  useEffect(() => { if (params.section === 'probes') setSection('probes'); }, [params.section]);

  if (section === 'probes') return <ProbeSection section={section} setSection={setSection} />;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><Page
    refreshing={maintenance.refreshing}
    onRefresh={maintenance.reload}
  >
    <MoreHeader section={section} setSection={setSection} />
    <MaintenanceSection result={maintenance} />
  </Page></SafeAreaView>;
}

function MoreHeader({ section, setSection }: { section: Section; setSection: (section: Section) => void }) {
  return <View style={styles.header}><PageTitle eyebrow="ENVIRONMENT CONTEXT" title="More" detail="Maintenance schedules and data collectors." /><View style={styles.menu}><Menu icon="calendar-outline" label="Maintenance" active={section === 'maintenance'} onPress={() => setSection('maintenance')} /><Menu icon="hardware-chip-outline" label="Probes" active={section === 'probes'} onPress={() => setSection('probes')} /></View></View>;
}

function MaintenanceSection({ result }: { result: ReturnType<typeof useApiData<MaintenanceView>> }) {
  const { colors } = useV2Theme();
  return <>
    <SectionTitle action={result.data ? <Text style={[styles.count, { color: colors.muted }]}>{result.data.header.active} active · {result.data.header.upcoming} upcoming</Text> : undefined}>Maintenance windows</SectionTitle>
    <State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !result.data?.records.length ? 'No maintenance windows.' : undefined} />
    {result.data?.records.map((item) => <Card key={item.id} accessibilityLabel={`${item.name}, ${item.status}`}><View style={styles.cardHeading}><View style={styles.statusTitle}><StatusIndicator status={item.status} domain="maintenance" /><Text style={[styles.itemTitle, { color: colors.ink }]}>{item.name}</Text></View><Text style={[styles.statusText, { color: colors.muted }]}>{item.status}</Text></View><Text style={[styles.description, { color: colors.muted }]}>{item.description || `${item.targetCount} target${item.targetCount === 1 ? '' : 's'}`}</Text><Text style={[styles.schedule, { color: colors.blue, borderTopColor: colors.line }]}>{item.schedule.startDate} · {item.schedule.startTime}–{item.schedule.endTime} {item.timezone}</Text></Card>)}
  </>;
}

function ProbeSection({ section, setSection }: { section: Section; setSection: (section: Section) => void }) {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const debouncedSearch = useDebouncedValue(search.trim());
  const path = useCallback((offset: number, limit: number) => {
    const query = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : '';
    const status = filter === 'All' ? '' : `&status=${encodeURIComponent(filter.toLowerCase())}`;
    return `/v2/probes?offset=${offset}&limit=${limit}${query}${status}`;
  }, [debouncedSearch, filter]);
  const result = usePaginatedApi<ProbeView, Probe>({ path, items: probeItems, total: probeTotal, enabled: section === 'probes', pageSize: 24 });
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><FlatList
    key={responsive.columns}
    data={result.records}
    numColumns={responsive.columns}
    keyExtractor={(probe) => probe.id}
    contentContainerStyle={[styles.listContent, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
    columnWrapperStyle={responsive.columns > 1 ? styles.columns : undefined}
    ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
    ListHeaderComponent={<View style={styles.header}><MoreHeader section={section} setSection={setSection} /><SectionTitle>Probes</SectionTitle><SearchField value={search} onChangeText={setSearch} placeholder="Search probes" /><FilterBar options={['All', 'Online', 'Offline']} value={filter} onChange={setFilter} label="Probe status" /></View>}
    ListHeaderComponentStyle={styles.listHeader}
    ListEmptyComponent={<State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !result.error ? 'No probes match this view.' : undefined} />}
    ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : null}
    renderItem={({ item }) => <View style={responsive.columns > 1 ? styles.column : undefined}><ProbeCard probe={item} /></View>}
    refreshing={result.refreshing}
    onRefresh={result.reload}
    onEndReached={result.loadMore}
    onEndReachedThreshold={.45}
    keyboardShouldPersistTaps="handled"
  /></SafeAreaView>;
}

function ProbeCard({ probe }: { probe: Probe }) {
  const { colors } = useV2Theme();
  return <Card style={styles.probeCard} accessibilityLabel={`${probe.name}, ${probe.status}`}><View style={styles.cardHeading}><View style={styles.statusTitle}><StatusIndicator status={probe.status} domain="probe" /><View><Text style={[styles.itemTitle, { color: colors.ink }]}>{probe.name}</Text><Text style={[styles.description, { color: colors.muted }]}>{probe.location || probe.privateIp}</Text></View></View><Text style={[styles.statusText, { color: colors.muted }]}>{probe.status}</Text></View><View style={[styles.probeMeta, { borderTopColor: colors.line }]}><Text style={[styles.metaStrong, { color: colors.ink }]}>{probe.assignedWork.targetCount} targets · {probe.assignedWork.monitorCount} monitors</Text><Text style={[styles.metadata, { color: colors.muted }]}>{probe.lastSeen}</Text></View></Card>;
}

function Menu({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  const { colors } = useV2Theme();
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.menuItem, { backgroundColor: active ? colors.cardRaised : colors.card, borderColor: active ? colors.navy : colors.line }, pressed && styles.pressed]}><Ionicons name={icon} size={19} color={colors.muted} importantForAccessibility="no" /><Text style={[styles.menuText, { color: active ? colors.ink : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  header: { gap: spacing.md },
  menu: { flexDirection: 'row', gap: spacing.sm },
  menuItem: { flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.md, borderWidth: 1 },
  menuText: { ...typography.metadata, fontWeight: '600', fontSize: 11 },
  pressed: { opacity: .72 },
  count: typography.metadata,
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  statusTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  itemTitle: typography.cardTitle,
  statusText: { ...typography.metadata, textTransform: 'capitalize' },
  description: { ...typography.metadata, marginTop: spacing.sm },
  schedule: { ...typography.metadata, fontWeight: '600', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
  listContent: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  listHeader: { marginBottom: spacing.lg },
  grow: { flexGrow: 1 },
  columns: { gap: layout.listGap },
  column: { flex: 1 },
  probeCard: { minHeight: 142, justifyContent: 'space-between' },
  probeMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  metaStrong: { ...typography.metadata, fontWeight: '600', flex: 1 },
  metadata: typography.metadata,
  flex: { flex: 1 },
});
