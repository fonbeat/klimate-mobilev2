import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useActiveIssues } from './active-issues-provider';
import { Card, RefreshWarning, SectionTitle, State, StatusPill, useResponsiveLayout } from './components';
import { monitorCard } from './live-status';
import { useForegroundRefresh } from './use-foreground-refresh';
import { layout, spacing, typography } from './tokens';
import { useV2Theme } from './theme';
import type { Monitor, Probe } from './types';

export function InboxActiveIssues({ header }: { header: ReactElement }) {
  const { gutter } = useResponsiveLayout();
  const { data, loading, error, refreshing, reload, refreshBackground } = useActiveIssues();
  useForegroundRefresh(refreshBackground);
  const sections = [
    { key: 'down', title: 'Monitors down', data: data?.down ?? [] },
    { key: 'attention', title: 'Monitors needing attention', data: data?.attention ?? [] },
    { key: 'offline', title: 'Offline gateways', data: data?.offline ?? [] },
  ].filter((section) => section.data.length > 0);

  return <SectionList<Monitor | Probe>
    sections={sections}
    stickySectionHeadersEnabled={false}
    keyExtractor={(item) => 'ID' in item ? item.ID : item.id}
    contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
    ListHeaderComponent={<>{header}{!!data?.count && <RefreshWarning error={error} />}</>}
    ListHeaderComponentStyle={styles.headerSpacing}
    ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
    ListEmptyComponent={<State loading={loading && !data} loadingMessage="Loading active issues…" error={error} onRetry={reload} empty={data ? 'No active issues.' : undefined} />}
    renderSectionHeader={({ section }) => <View style={styles.sectionHeading}><SectionTitle>{section.title}</SectionTitle></View>}
    renderItem={({ item }) => <ActiveIssueCard item={item} />}
    refreshing={refreshing}
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
  sectionHeading: { marginTop: spacing.md, marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  identity: { flex: 1, gap: spacing.xs },
  pressed: { opacity: .72 },
});
