import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Page, SectionTitle, State, StatusIndicator, SummaryStrip } from '@/components';
import { getOverviewHealth } from '@/status';
import { spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { AttentionCenter, IncidentPage, NotificationInboxPage, StatusSummary } from '@/types';
import { useApiData } from '@/use-api';
import { useSession } from '@/session';

export default function Overview() {
  const { session } = useSession();
  const { colors } = useV2Theme();
  const summary = useApiData<StatusSummary>('/v2/status/summary');
  const attention = useApiData<AttentionCenter>('/v2/attention');
  const incidents = useApiData<IncidentPage>('/v2/incidents?page=1&pageSize=2');
  const notifications = useApiData<NotificationInboxPage>('/v2/notifications?offset=0&limit=1');
  const unread = notifications.data?.unread ?? 0;
  useFocusEffect(useCallback(() => { notifications.reload(); }, [notifications.reload]));
  const loading = summary.loading && !summary.data;
  const refreshing = summary.refreshing || attention.refreshing || incidents.refreshing;
  const refresh = () => { summary.reload(); attention.reload(); incidents.reload(); };
  const health = getOverviewHealth(summary.data ?? undefined);
  const hero = summary.data ? overviewHero(summary.data, colors) : null;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><Page refreshing={refreshing} onRefresh={refresh}>
    <View style={styles.top}>
      <View><Text accessibilityRole="header" style={[styles.brand, { color: colors.ink }]}>Klimate<Text style={{ color: colors.blue }}>.</Text></Text><Text style={[styles.greeting, { color: colors.muted }]}>Hello, {session?.user.firstname}</Text></View>
      <View style={styles.topActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')} style={({ pressed }) => [styles.notificationButton, { backgroundColor: colors.card, borderColor: colors.line }, pressed && styles.pressed]}>
          <Ionicons name="notifications-outline" size={21} color={colors.muted} importantForAccessibility="no" />
          {unread > 0 && <View style={[styles.badge, { backgroundColor: colors.down }]}><Text style={[styles.badgeText, { color: colors.onStatus }]}>{unread > 99 ? '99+' : unread}</Text></View>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile and preferences" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.avatar, { backgroundColor: colors.cardRaised, borderColor: colors.line }, pressed && styles.pressed]}><Text style={[styles.avatarText, { color: colors.blue }]}>{session?.user.firstname?.[0]}{session?.user.lastname?.[0]}</Text></Pressable>
      </View>
    </View>
    <State loading={loading} error={summary.error} onRetry={refresh} />
    {summary.data && <>
      <Card style={styles.hero} accessibilityLabel={`Current status, ${hero?.title}. ${hero?.message}`}>
        <View style={styles.statusHeading}><Text style={[styles.currentStatus, { color: colors.muted }]}>ENVIRONMENT HEALTH</Text><Text style={[styles.updated, { color: colors.muted }]}>{formatUpdated(summary.data.lastUpdated)}</Text></View>
        <View style={styles.heroBody}><View style={styles.heroCopy}><View style={styles.heroState}><View style={[styles.heroDot, { backgroundColor: hero?.color }]} /><Text style={[styles.heroTitle, { color: colors.ink }]}>{hero?.title}</Text></View><Text style={[styles.heroMessage, { color: colors.muted }]}>{hero?.message}</Text></View><View style={[styles.statusRing, { backgroundColor: `${hero?.color}24` }]}><View style={[styles.statusRingInner, { backgroundColor: colors.card }]}><Text style={[styles.ringValue, { color: hero?.color }]}>{health.percentage == null ? '—' : `${health.percentage}%`}</Text></View></View></View>
      </Card>
      <SummaryStrip items={[
        { label: 'Total', value: summary.data.totalMonitors },
        { label: 'Up', value: summary.data.upMonitors, tone: 'positive' },
        { label: 'Down', value: summary.data.downMonitors, tone: 'critical' },
        { label: 'Attention', value: summary.data.attentionMonitors, tone: 'warning' },
      ]} />
      {!!attention.data?.count && <><SectionTitle>Needs attention</SectionTitle>{attention.data.items.slice(0, 3).map((item) => <Card key={item.id} accessibilityLabel={`${item.severity}: ${item.header}`}><View style={styles.attention}><StatusIndicator status={item.severity} domain="attention" size={12} /><View style={styles.flex}><Text style={[styles.itemTitle, { color: colors.ink }]}>{item.header}</Text><Text style={[styles.metadata, { color: colors.muted }]}>{item.message}</Text></View></View></Card>)}</>}
      {!!incidents.data?.incidents.length && <><SectionTitle action={<Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/incidents')} style={({ pressed }) => pressed && styles.pressed}><Text style={[styles.viewAll, { color: colors.blue }]}>View all</Text></Pressable>}>Recent activity</SectionTitle><Card style={styles.activityCard}>{incidents.data.incidents.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.status}`} onPress={() => router.push('/(tabs)/incidents')} style={({ pressed }) => [styles.incident, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}><StatusIndicator status={item.status} domain="incident" /><View style={styles.flex}><Text numberOfLines={1} style={[styles.itemTitle, { color: colors.ink }]}>{item.label}</Text><Text numberOfLines={1} style={[styles.metadata, { color: colors.muted }]}>{item.monitorLabel} · {item.startedAt}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>)}</Card></>}
    </>}
  </Page></SafeAreaView>;
}

function overviewHero(summary: StatusSummary, colors: ReturnType<typeof useV2Theme>['colors']) {
  if (!summary.totalMonitors) return { title: 'Waiting for data', message: 'No monitoring results are available yet.', color: colors.unknown };
  if (summary.downMonitors > 0) {
    const remaining = Math.max(0, summary.totalMonitors - summary.downMonitors);
    return { title: 'Action needed', message: `${summary.downMonitors} monitor${summary.downMonitors === 1 ? ' is' : 's are'} down. ${remaining} remain operational.`, color: colors.down };
  }
  if (summary.attentionMonitors > 0) return { title: 'Keep watch', message: `${summary.attentionMonitors} monitor${summary.attentionMonitors === 1 ? ' needs' : 's need'} attention.`, color: colors.attention };
  if (summary.unknownMonitors > 0) return { title: 'Waiting on checks', message: `${summary.unknownMonitors} monitor${summary.unknownMonitors === 1 ? ' has' : 's have'} not reported yet.`, color: colors.unknown };
  return { title: 'All clear', message: `All ${summary.totalMonitors} monitor${summary.totalMonitors === 1 ? ' is' : 's are'} running smoothly.`, color: colors.up };
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `Updated ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  brand: { fontSize: 23, lineHeight: 28, fontWeight: '700', letterSpacing: -.6 },
  greeting: { ...typography.metadata, marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notificationButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '800' },
  pressed: { opacity: .72 },
  avatar: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typography.cardTitle },
  hero: { paddingVertical: spacing.lg },
  statusHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  currentStatus: { ...typography.eyebrow, fontSize: 10 },
  updated: { ...typography.metadata, flexShrink: 1, textAlign: 'right' },
  heroBody: { width: '100%', minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  heroCopy: { flex: 1 },
  heroState: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroDot: { width: 9, height: 9, borderRadius: 9 },
  statusRing: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  statusRingInner: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  ringValue: { ...typography.metric, fontSize: 19, lineHeight: 24 },
  heroTitle: { ...typography.sectionTitle, fontSize: 20, lineHeight: 26 },
  heroMessage: { ...typography.body, marginTop: spacing.sm },
  attention: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  activityCard: { paddingVertical: spacing.xs },
  incident: { minHeight: 62, flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  flex: { flex: 1 },
  itemTitle: typography.cardTitle,
  metadata: { ...typography.metadata, marginTop: spacing.xs },
  viewAll: { ...typography.metadata, fontWeight: '700' },
});
