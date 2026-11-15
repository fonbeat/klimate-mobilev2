import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, type ReactElement } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button, Card, RefreshWarning, SectionTitle, State, StatusPill, useResponsiveLayout } from './components';
import { liveStatusPath, monitorCard, offlineGatewaysPath } from './live-status';
import { useForegroundRefresh } from './use-foreground-refresh';
import { usePaginatedApi } from './use-paginated-api';
import { layout, spacing, typography } from './tokens';
import { useV2Theme } from './theme';
import type { Monitor, MonitorPage, Probe, ProbeView } from './types';

const downPath = (offset: number, limit: number) => liveStatusPath('monitors', offset, limit, 'Down', '');
const attentionPath = (offset: number, limit: number) => liveStatusPath('monitors', offset, limit, 'Attention', '');
const monitors = (page: MonitorPage) => page.records;
const gateways = (page: ProbeView) => page.probes;
const total = (page: MonitorPage | ProbeView) => page.total;
type IssueViewToken = { item: unknown; index?: number | null; section?: { key?: string } };

export function InboxActiveIssues({ header }: { header: ReactElement }) {
  const { gutter } = useResponsiveLayout();
  const down = usePaginatedApi({ path: downPath, items: monitors, total });
  const attention = usePaginatedApi({ path: attentionPath, items: monitors, total });
  const offline = usePaginatedApi({ path: offlineGatewaysPath, items: gateways, total });
  useForegroundRefresh(() => { void down.refreshVisible(); void attention.refreshVisible(); void offline.refreshVisible(); });

  const onDownVisible = down.onViewableItemsChanged;
  const onAttentionVisible = attention.onViewableItemsChanged;
  const onOfflineVisible = offline.onViewableItemsChanged;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: IssueViewToken[] }) => {
    onDownVisible({ viewableItems: viewableItems.filter((item) => item.index != null && item.section?.key === 'down') });
    onAttentionVisible({ viewableItems: viewableItems.filter((item) => item.index != null && item.section?.key === 'attention') });
    onOfflineVisible({ viewableItems: viewableItems.filter((item) => item.index != null && item.section?.key === 'offline') });
  }, [onDownVisible, onAttentionVisible, onOfflineVisible]);

  const sections = [
    { key: 'down', title: 'Monitors down', data: down.records, result: down },
    { key: 'attention', title: 'Monitors needing attention', data: attention.records, result: attention },
    { key: 'offline', title: 'Offline gateways', data: offline.records, result: offline },
  ].filter(({ data, result }) => data.length > 0 || !!result.error);
  const loading = down.loading || attention.loading || offline.loading;
  const reload = () => { void down.reload(); void attention.reload(); void offline.reload(); };

  return <SectionList<Monitor | Probe>
    sections={sections}
    stickySectionHeadersEnabled={false}
    keyExtractor={(item) => 'ID' in item ? item.ID : item.id}
    onViewableItemsChanged={onViewableItemsChanged}
    contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
    ListHeaderComponent={header}
    ListHeaderComponentStyle={styles.headerSpacing}
    ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
    ListFooterComponent={loading || !sections.length ? <State loading={loading} loadingMessage="Loading active issues…" empty="No active issues." /> : undefined}
    renderSectionHeader={({ section }) => <SectionTitle>{section.title}</SectionTitle>}
    renderSectionFooter={({ section: { title, data, result } }) => <View style={styles.sectionFooter}>
      {data.length ? <RefreshWarning error={result.error} /> : <State compact error={result.error} onRetry={result.reload} />}
      {result.hasMore && <Button label={`Load more: ${title.toLowerCase()}`} variant="secondary" busy={result.loadingMore} onPress={result.loadMore} />}
    </View>}
    renderItem={({ item }) => <ActiveIssueCard item={item} />}
    refreshing={down.refreshing || attention.refreshing || offline.refreshing}
    onRefresh={reload}
  />;
}

function ActiveIssueCard({ item }: { item: Monitor | Probe }) {
  const { colors } = useV2Theme();
  const monitor = 'ID' in item ? monitorCard(item) : null;
  const gateway = 'id' in item ? item : null;
  const title = monitor?.label ?? gateway?.name;
  const detail = monitor ? [monitor.kind, monitor.subtitle].filter(Boolean).join(' · ') : gateway?.location;
  const open = () => {
    if (monitor) router.push({ pathname: '/status/[view]/[id]', params: { view: monitor.detailView, id: monitor.detailId, ...(monitor.reportPath ? { reportPath: monitor.reportPath } : {}) } });
    else if (gateway) router.push({ pathname: '/probe/[id]', params: { id: gateway.id } });
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}, ${item.status}`} onPress={open} style={({ pressed }) => pressed && styles.pressed}>
    <Card style={styles.card}>
      <View style={styles.identity}><Text numberOfLines={2} style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>{!!detail && <Text numberOfLines={1} style={[typography.metadata, { color: colors.muted }]}>{detail}</Text>}</View>
      <StatusPill status={item.status} domain={monitor ? 'monitor' : 'probe'} />
      <Ionicons name="chevron-forward" size={16} color={colors.muted} importantForAccessibility="no" />
    </Card>
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  headerSpacing: { marginBottom: spacing.lg },
  sectionFooter: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  identity: { flex: 1, gap: spacing.xs },
  pressed: { opacity: .72 },
});
