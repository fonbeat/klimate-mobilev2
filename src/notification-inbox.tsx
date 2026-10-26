import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FilterBar, ListFooter, RefreshWarning, SectionTitle, State, useResponsiveLayout } from '@/components';
import { messageOf } from '@/api';
import { useInboxBadge } from '@/inbox-badge';
import { inboxItems } from '@/inbox-recovery';
import { useSession } from '@/session';
import { layout, radii, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { NotificationInboxItem, NotificationInboxPage } from '@/types';
import { useAuthenticatedRequest } from '@/use-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { usePaginatedApi } from '@/use-paginated-api';

const pageItems = (page: NotificationInboxPage) => page.records;
const pageTotal = (page: NotificationInboxPage) => page.total;

export default function NotificationInbox() {
  const { session } = useSession();
  return <InboxScreen key={`${session?.user.ID}:${session?.tenantId ?? ''}`} />;
}

function InboxScreen() {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const request = useAuthenticatedRequest();
  const { unread: sharedUnread, refresh: refreshBadge, inspect, recovered, invalidate: invalidateBadge, recordRead } = useInboxBadge();
  const [filter, setFilter] = useState('All');
  const unread = sharedUnread ?? 0;
  const inboxSummary = sharedUnread == null ? 'Checking outstanding alerts…' : unread ? `${unread} unread operational alert${unread === 1 ? '' : 's'}.` : 'You’re all caught up.';
  const [actionError, setActionError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [markingItem, setMarkingItem] = useState(false);
  const mutating = useRef(false);
  const pagePath = useCallback((offset: number, limit: number) => `/v2/notifications?offset=${offset}&limit=${limit}&unreadOnly=${filter === 'Unread'}`, [filter]);
  const result = usePaginatedApi<NotificationInboxPage, NotificationInboxItem>({ path: pagePath, items: pageItems, total: pageTotal, pageSize: 30 });
  const records = useMemo(() => inboxItems(result.records, filter === 'Unread', recovered), [filter, recovered, result.records]);
  useEffect(() => { void inspect(result.records); }, [inspect, result.records]);
  // Recovered rows still occupy server pagination slots. Continue past a page
  // of history rather than falsely showing an empty Unread list.
  useEffect(() => {
    if (filter === 'Unread' && records.length < 8 && result.hasMore && !result.loading && !result.refreshing && !result.loadingMore && !result.error) result.loadMore();
  }, [filter, records.length, result.hasMore, result.loading, result.refreshing, result.loadingMore, result.error, result.loadMore]);
  const refresh = () => { void result.refreshVisible(); void refreshBadge(); };
  const reload = () => { void result.reload(); void refreshBadge(true); };
  const findingUnread = filter === 'Unread' && !records.length && result.hasMore && !result.error;
  useForegroundRefresh(refresh, !markingAll && !markingItem);

  const markRead = async (item: NotificationInboxItem) => {
    if (mutating.current) return;
    // Navigation must not wait for read-state writes or a whole Inbox scan.
    if (item.eventType === 'probe_offline' && item.resourceId) router.push({ pathname: '/probe/[id]', params: { id: item.resourceId } } as unknown as Href);
    else if (item.eventType === 'monitor_down' && item.resourceId) router.push({ pathname: '/status/[view]/[id]', params: { view: 'monitors', id: item.resourceId } } as unknown as Href);
    else if (item.eventType === 'probe_offline') router.push({ pathname: '/(tabs)/more', params: { section: 'probes' } });
    else router.push('/(tabs)/incidents');
    if (!item.read) {
      mutating.current = true;
      setMarkingItem(true);
      result.invalidate();
      invalidateBadge();
      try {
        await request<void>(`/v2/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PATCH', body: '{}' });
        result.setRecords((records) => filter === 'Unread' ? records.filter((record) => record.id !== item.id) : records.map((record) => record.id === item.id ? { ...record, read: true } : record));
        recordRead(item.id);
        void result.refreshVisible();
        void refreshBadge();
      } catch (error) { setActionError(messageOf(error)); return; }
      finally { mutating.current = false; setMarkingItem(false); }
    }
  };

  const markAllRead = async () => {
    if (mutating.current) return;
    mutating.current = true;
    result.invalidate();
    invalidateBadge();
    setMarkingAll(true); setActionError('');
    try {
      await request<void>('/v2/notifications/read', { method: 'PATCH', body: '{}' });
      recordRead();
      result.setRecords((records) => filter === 'Unread' ? [] : records.map((record) => ({ ...record, read: true })));
      await result.refreshVisible();
      await refreshBadge();
    } catch (error) { setActionError(messageOf(error)); }
    finally { mutating.current = false; setMarkingAll(false); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><FlatList
    data={records}
    extraData={recovered}
    keyExtractor={(item) => item.id}
    contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
    ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
    ListHeaderComponent={<View style={styles.header}>
      <View style={styles.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Close Inbox" onPress={() => router.back()} style={({ pressed }) => [styles.close, { borderColor: colors.line, backgroundColor: colors.card }, pressed && styles.pressed]}><Ionicons name="close" size={25} color={colors.ink} /></Pressable><Text accessibilityRole="header" style={[styles.navigationTitle, { color: colors.ink }]}>Inbox</Text><View style={styles.navigationSpacer} /></View>
      <View style={styles.intro}><Text style={[styles.eyebrow, { color: colors.blue }]}>OPERATIONAL ALERTS</Text><Text style={[styles.detail, { color: colors.muted }]}>{inboxSummary}</Text></View>
      <SectionTitle>Messages</SectionTitle>
      <View style={styles.actions}><FilterBar options={['All', 'Unread']} value={filter} onChange={setFilter} label="Notification status" />{unread > 0 && <View style={styles.markAll}><Button label="Mark all read" variant="secondary" icon="checkmark-done-outline" busy={markingAll} onPress={() => void markAllRead()} /></View>}</View>
      {!!actionError && <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.down }]}>{actionError}</Text>}{!!result.records.length && <RefreshWarning error={result.error} />}
    </View>}
    ListHeaderComponentStyle={styles.headerSpacing}
    ListEmptyComponent={<State loading={result.loading || findingUnread} loadingMessage="Loading alerts…" error={result.error} onRetry={reload} empty={!result.loading && !findingUnread && !result.error ? filter === 'Unread' ? 'No unread notifications.' : 'No notifications yet.' : undefined} />}
    ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : undefined}
    renderItem={({ item }) => <NotificationCard item={item} recovered={recovered(item)} onPress={() => void markRead(item)} />}
    refreshing={result.refreshing}
    onRefresh={reload}
    onEndReached={result.loadMore}
    onEndReachedThreshold={.45}
  /></SafeAreaView>;
}

function NotificationCard({ item, recovered, onPress }: { item: NotificationInboxItem; recovered: boolean; onPress: () => void }) {
  const { colors } = useV2Theme();
  const icon = recovered ? 'checkmark-circle-outline' : item.eventType === 'probe_offline' ? 'hardware-chip-outline' : 'alert-circle-outline';
  const unread = !item.read && !recovered;
  const tone = recovered ? colors.up : colors.down;
  const time = new Date(item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return <Pressable accessibilityRole="button" accessibilityLabel={`${recovered ? 'Recovered. ' : unread ? 'Unread. ' : ''}${item.title}. ${item.body}`} onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: unread ? colors.cardRaised : colors.card, borderColor: colors.line }, pressed && styles.pressed]}>
    <View style={[styles.icon, { backgroundColor: `${tone}14` }]}><Ionicons name={icon} size={21} color={tone} /></View>
    <View style={styles.flex}><View style={styles.titleRow}><Text style={[styles.title, { color: colors.ink }]}>{item.title}</Text>{unread && <View accessibilityLabel="Unread" style={[styles.unreadDot, { backgroundColor: colors.blue }]} />}</View>{recovered && <Text style={[styles.time, { color: colors.up }]}>Recovered</Text>}<Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text><Text style={[styles.time, { color: colors.muted }]}>{time}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={colors.muted} importantForAccessibility="no" />
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: spacing.md },
  navigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navigationTitle: typography.sectionTitle,
  navigationSpacer: { width: 48 },
  close: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { paddingVertical: spacing.md, gap: spacing.xs },
  eyebrow: typography.eyebrow,
  detail: typography.body,
  headerSpacing: { marginBottom: spacing.lg },
  actions: { gap: spacing.md },
  markAll: { alignSelf: 'flex-start', minWidth: 170 },
  error: typography.metadata,
  card: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg },
  pressed: { opacity: .72 },
  icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: typography.cardTitle,
  unreadDot: { width: 8, height: 8, borderRadius: 8 },
  body: { ...typography.body, marginTop: spacing.xs },
  time: { ...typography.metadata, marginTop: spacing.sm },
});
