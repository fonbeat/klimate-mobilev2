import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLogo } from '@/brand-logo';
import { Card, Page, State } from '@/components';
import { cardsForPage, liveStatusPath, statusCounts } from '@/live-status';
import { overviewIssueFilter, overviewPortrait, overviewSectionTitle, type HealthCounts } from '@/overview-presentation';
import { useInboxBadge } from '@/inbox-badge';
import { useSession } from '@/session';
import { useStatusView } from '@/status-view';
import { spacing, typography } from '@/tokens';
import { statusColor, useV2Theme } from '@/theme';
import type { MonitorPage } from '@/types';
import { useApiData } from '@/use-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { SwipeTab } from '@/swipe-tabs';

export default function Overview() {
  const { session } = useSession();
  return <MonitorOverview key={session?.tenantId ?? ''} />;
}

function MonitorOverview() {
  const { session } = useSession();
  const { setActiveView } = useStatusView();
  const { unread: sharedUnread, refresh: refreshInbox } = useInboxBadge();
  const { colors } = useV2Theme();
  const down = useApiData<MonitorPage>(liveStatusPath('monitors', 0, 3, 'down', ''));
  const attention = useApiData<MonitorPage>(liveStatusPath('monitors', 0, 3, 'attention', ''));
  const unread = sharedUnread ?? 0;
  const counts = statusCounts('monitors', down.data ?? attention.data);
  const issues = [...(down.data ? cardsForPage('monitors', down.data) : []), ...(attention.data ? cardsForPage('monitors', attention.data) : [])].slice(0, 3);
  const issueCount = counts.down + counts.attention;
  const loading = down.loading && !down.data && !attention.data;
  const error = !down.data && !attention.data ? down.error ?? attention.error : null;
  const refreshing = down.refreshing || attention.refreshing;
  const refresh = () => { void down.reload(); void attention.reload(); void refreshInbox(); };
  useForegroundRefresh(() => { void down.refreshBackground(); void attention.refreshBackground(); void refreshInbox(); });
  const lastUpdated = down.data?.summary?.lastUpdated ?? attention.data?.summary?.lastUpdated;
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  useEffect(() => { if (down.data || attention.data) setLastRefreshed(new Date()); }, [down.data, attention.data]);
  const updatedLabel = lastUpdated ? formatUpdated(lastUpdated, 'Updated') : lastRefreshed ? formatUpdated(lastRefreshed, 'Refreshed') : '';
  const staleError = down.error || attention.error;
  const issueFilter = overviewIssueFilter(counts);
  const openAffectedMonitors = () => {
    if (!issueFilter) return;
    setActiveView('monitors');
    router.push({ pathname: '/(tabs)/monitors', params: { statusFilter: issueFilter } });
  };

  return <SwipeTab current="overview"><SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><Page refreshing={refreshing} onRefresh={refresh}>
    <View style={styles.top}>
      <View><BrandLogo /><Text style={[styles.greeting, { color: colors.muted }]}>Hello, {session?.user.firstname}</Text></View>
      <View style={styles.topActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')} style={({ pressed }) => [styles.notificationButton, { backgroundColor: colors.card, borderColor: colors.line }, pressed && styles.pressed]}>
          <Ionicons name="notifications-outline" size={21} color={colors.muted} importantForAccessibility="no" />
          {unread > 0 && <View style={[styles.badge, { backgroundColor: colors.down }]}><Text style={[styles.badgeText, { color: colors.onStatus }]}>{unread > 99 ? '99+' : unread}</Text></View>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile and preferences" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.avatar, { backgroundColor: colors.cardRaised, borderColor: colors.line }, pressed && styles.pressed]}><Text style={[styles.avatarText, { color: colors.blue }]}>{session?.user.firstname?.[0]}{session?.user.lastname?.[0]}</Text></Pressable>
      </View>
    </View>
    <State loading={loading} loadingMessage="Loading monitor health…" error={error} onRetry={refresh} />
    {!!staleError && (down.data || attention.data) && <Card><Text accessibilityLiveRegion="polite" style={[styles.emptyText, { color: colors.attention }]}>Couldn’t refresh monitors. Showing the last known status. Pull down to try again.</Text></Card>}
    {(down.data || attention.data) && <>
      <HealthPortrait counts={counts} updatedLabel={updatedLabel} onPress={issueFilter ? openAffectedMonitors : undefined} />
      <View style={styles.priorityHeader}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[styles.priorityTitle, { color: colors.ink }]}>{overviewSectionTitle(counts)}</Text>
          {issueCount > 0 && <Text style={[styles.prioritySub, { color: colors.muted }]}>Your monitors requiring a closer look</Text>}
        </View>
        {issueCount > 0 && <Pressable accessibilityRole="button" accessibilityLabel={counts.down > 0 ? 'See all down monitors' : 'See all monitors needing attention'} onPress={openAffectedMonitors} style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}><Text style={[styles.seeAllText, { color: colors.blue }]}>See all</Text><Ionicons name="arrow-forward" size={16} color={colors.blue} /></Pressable>}
      </View>
      {issues.length ? <View style={[styles.issueList, { backgroundColor: colors.card }]}>{issues.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.label}, ${item.status}`} onPress={() => router.push({ pathname: '/status/[view]/[id]', params: { view: item.detailView, id: item.detailId, ...(item.reportPath ? { reportPath: item.reportPath } : {}) } } as unknown as Href)} style={({ pressed }) => [styles.issue, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}><View style={styles.flex}><Text numberOfLines={2} style={[styles.itemTitle, { color: colors.ink }]}>{item.label}</Text><Text numberOfLines={1} style={[styles.metadata, { color: colors.muted }]}>{item.kind} · {item.subtitle}</Text></View><View style={styles.issueStatusGroup}><View style={[styles.issueDot, { backgroundColor: statusColor(item.status, 'monitor', colors) }]} /><Text style={[styles.issueStatus, { color: colors.ink }]}>{item.status}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>)}</View>
        : <View style={[styles.quietCard, { backgroundColor: colors.card }]}><View style={[styles.quietDot, { backgroundColor: issueCount || counts.unknown ? colors.attention : colors.up }]} /><View style={styles.flex}><Text style={[styles.quietTitle, { color: colors.ink }]}>{issueCount ? 'Checking affected monitors' : counts.unknown ? 'No confirmed issues' : counts.total ? 'Nothing needs attention' : 'Ready when your environment is'}</Text><Text style={[styles.quietDetail, { color: colors.muted }]}>{issueCount ? staleError ? 'Affected monitors are unavailable. Pull down to try again.' : 'Affected monitors are loading…' : counts.unknown ? `${counts.unknown} ${counts.unknown === 1 ? 'monitor' : 'monitors'} still awaiting a clear status.` : counts.total ? `No down or attention monitors.${updatedLabel ? ` ${updatedLabel}.` : ''}` : 'Once monitors start reporting, anything needing attention will appear here.'}</Text></View></View>}
    </>}
  </Page></SafeAreaView></SwipeTab>;
}

function HealthPortrait({ counts, updatedLabel, onPress }: { counts: HealthCounts; updatedLabel: string; onPress?: () => void }) {
  const { colors } = useV2Theme();
  const portrait = overviewPortrait('monitors', counts);
  const accent = colors[portrait.tone];
  const distribution = [
    { label: 'Healthy', count: counts.healthy, color: colors.up },
    { label: 'Down', count: counts.down, color: colors.down },
    { label: 'Attention', count: counts.attention, color: colors.attention },
    { label: 'Unknown', count: counts.unknown, color: colors.unknown },
  ];
  const accessibilityLabel = `Monitors: ${portrait.headline}. ${portrait.detail}. ${updatedLabel}`;
  const content = <Card style={styles.portrait} accessibilityLabel={onPress ? undefined : accessibilityLabel}>
    <View style={styles.portraitTop}><Text style={[styles.eyebrow, { color: colors.muted }]}>ENVIRONMENT HEALTH</Text><Text style={[styles.updated, { color: colors.muted }]}>{updatedLabel}</Text></View>
    <View style={styles.healthStatement}><View style={[styles.healthDot, { backgroundColor: accent }]} /><Text style={[styles.portraitHeadline, { color: colors.ink }]}>{portrait.headline}</Text></View>
    <Text style={[styles.portraitDetail, { color: colors.muted }]}>{portrait.detail}</Text>
    <View accessible accessibilityLabel={distribution.map((item) => `${item.count} ${item.label.toLowerCase()}`).join(', ')} style={[styles.distributionTrack, { backgroundColor: colors.cardRaised }]}>{counts.total > 0 && distribution.filter((item) => item.count > 0).map((item) => <View key={item.label} style={{ flex: item.count, backgroundColor: item.color }} />)}</View>
    <View style={styles.distributionLegend}>{distribution.filter((item) => item.count > 0 || item.label !== 'Unknown').map((item) => <View key={item.label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><Text style={[styles.legendText, { color: colors.muted }]}>{item.label}</Text><Text style={[styles.legendCount, { color: colors.ink }]}>{item.count}</Text></View>)}</View>
  </Card>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={`Opens Status, Monitors, ${counts.down > 0 ? 'Down' : 'Attention'}`} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content;
}

function formatUpdated(value: string | Date, verb: string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${verb} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  greeting: { ...typography.metadata, marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notificationButton: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '800' },
  pressed: { opacity: .72 },
  avatar: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typography.cardTitle },
  eyebrow: typography.eyebrow,
  portrait: { padding: spacing.xl },
  portraitTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  updated: { ...typography.metadata, flexShrink: 1, textAlign: 'right' },
  healthStatement: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl },
  healthDot: { width: 12, height: 12, borderRadius: 6 },
  portraitHeadline: { flex: 1, fontSize: 27, lineHeight: 34, fontWeight: '700', letterSpacing: -.8 },
  portraitDetail: { ...typography.body, fontSize: 15, marginTop: spacing.sm },
  distributionTrack: { height: 5, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginTop: spacing.xxl },
  distributionLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: typography.metadata,
  legendCount: { ...typography.metadata, fontWeight: '700' },
  priorityHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  priorityTitle: typography.sectionTitle,
  prioritySub: { ...typography.metadata, marginTop: 2 },
  seeAll: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  seeAllText: { ...typography.metadata, fontWeight: '700' },
  issueList: { borderRadius: 12, overflow: 'hidden', paddingHorizontal: spacing.lg },
  issue: { minHeight: 72, flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  issueDot: { width: 9, height: 9, borderRadius: 5 },
  issueStatusGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  issueStatus: { ...typography.metadata, fontWeight: '600', textTransform: 'capitalize' },
  flex: { flex: 1 },
  itemTitle: typography.cardTitle,
  metadata: { ...typography.metadata, marginTop: spacing.xs },
  emptyText: typography.body,
  quietCard: { minHeight: 110, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 18 },
  quietDot: { width: 11, height: 11, borderRadius: 6 },
  quietTitle: typography.cardTitle,
  quietDetail: { ...typography.body, marginTop: spacing.xs },
});
