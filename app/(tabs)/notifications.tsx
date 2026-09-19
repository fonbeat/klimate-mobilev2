import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FilterBar, ListFooter, State, useResponsiveLayout } from '@/components';
import { messageOf } from '@/api';
import { layout, radii, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { NotificationInboxItem, NotificationInboxPage } from '@/types';
import { useAuthenticatedRequest } from '@/use-api';
import { usePaginatedApi } from '@/use-paginated-api';

const pageItems = (page: NotificationInboxPage) => page.records;
const pageTotal = (page: NotificationInboxPage) => page.total;

export default function Notifications() {
  const { colors } = useV2Theme();
  const responsive = useResponsiveLayout();
  const request = useAuthenticatedRequest();
  const [filter, setFilter] = useState('All');
  const [unread, setUnread] = useState(0);
  const [actionError, setActionError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const pagePath = useCallback((offset: number, limit: number) => `/v2/notifications?offset=${offset}&limit=${limit}&unreadOnly=${filter === 'Unread'}`, [filter]);
  const onPage = useCallback((page: NotificationInboxPage) => setUnread(page.unread), []);
  const result = usePaginatedApi<NotificationInboxPage, NotificationInboxItem>({ path: pagePath, items: pageItems, total: pageTotal, onPage, pageSize: 30 });

  const markRead = async (item: NotificationInboxItem) => {
    if (!item.read) {
      try {
        await request<void>(`/v2/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PATCH' });
        result.setRecords((records) => filter === 'Unread' ? records.filter((record) => record.id !== item.id) : records.map((record) => record.id === item.id ? { ...record, read: true } : record));
        setUnread((count) => Math.max(0, count - 1));
      } catch (error) { setActionError(messageOf(error)); return; }
    }
    if (item.eventType === 'probe_offline') router.push({ pathname: '/(tabs)/more', params: { section: 'probes' } });
    else router.push('/(tabs)/incidents');
  };

  const markAllRead = async () => {
    setMarkingAll(true); setActionError('');
    try {
      await request<void>('/v2/notifications/read', { method: 'PATCH' });
      setUnread(0);
      result.setRecords((records) => filter === 'Unread' ? [] : records.map((record) => ({ ...record, read: true })));
    } catch (error) { setActionError(messageOf(error)); }
    finally { setMarkingAll(false); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><FlatList
    data={result.records}
    keyExtractor={(item) => item.id}
    contentContainerStyle={[styles.content, { paddingHorizontal: responsive.gutter }, !result.records.length && styles.grow]}
    ItemSeparatorComponent={() => <View style={{ height: layout.listGap }} />}
    ListHeaderComponent={<View style={styles.header}><View style={styles.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Close Inbox" onPress={() => router.back()} style={({ pressed }) => [styles.close, { borderColor: colors.line, backgroundColor: colors.card }, pressed && styles.pressed]}><Ionicons name="close" size={25} color={colors.ink} /></Pressable><Text accessibilityRole="header" style={[styles.navigationTitle, { color: colors.ink }]}>Inbox</Text><View style={styles.navigationSpacer} /></View><View style={styles.intro}><Text style={[styles.eyebrow, { color: colors.blue }]}>OPERATIONAL ALERTS</Text><Text style={[styles.detail, { color: colors.muted }]}>{unread ? `${unread} unread operational alert${unread === 1 ? '' : 's'}.` : 'You’re all caught up.'}</Text></View><View style={styles.actions}><FilterBar options={['All', 'Unread']} value={filter} onChange={setFilter} label="Notification status" />{unread > 0 && <View style={styles.markAll}><Button label="Mark all read" variant="secondary" icon="checkmark-done-outline" busy={markingAll} onPress={() => void markAllRead()} /></View>}</View>{!!actionError && <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.down }]}>{actionError}</Text>}</View>}
    ListHeaderComponentStyle={styles.headerSpacing}
    ListEmptyComponent={<State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !result.error ? filter === 'Unread' ? 'No unread notifications.' : 'No notifications yet.' : undefined} />}
    ListFooterComponent={result.records.length ? <ListFooter loading={result.loadingMore} hasMore={result.hasMore} /> : null}
    renderItem={({ item }) => <NotificationCard item={item} onPress={() => void markRead(item)} />}
    refreshing={result.refreshing}
    onRefresh={result.reload}
    onEndReached={result.loadMore}
    onEndReachedThreshold={.45}
  /></SafeAreaView>;
}

function NotificationCard({ item, onPress }: { item: NotificationInboxItem; onPress: () => void }) {
  const { colors } = useV2Theme();
  const icon = item.eventType === 'probe_offline' ? 'hardware-chip-outline' : 'alert-circle-outline';
  const time = new Date(item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`} onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: item.read ? colors.card : colors.cardRaised, borderColor: colors.line }, pressed && styles.pressed]}>
    <View style={[styles.icon, { backgroundColor: `${colors.down}14` }]}><Ionicons name={icon} size={21} color={colors.down} /></View>
    <View style={styles.flex}><View style={styles.titleRow}><Text style={[styles.title, { color: colors.ink }]}>{item.title}</Text>{!item.read && <View accessibilityLabel="Unread" style={[styles.unreadDot, { backgroundColor: colors.blue }]} />}</View><Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text><Text style={[styles.time, { color: colors.muted }]}>{time}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={colors.muted} importantForAccessibility="no" />
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: spacing.md },
  navigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navigationTitle: typography.sectionTitle,
  navigationSpacer: { width: 44 },
  close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { paddingVertical: spacing.md, gap: spacing.xs },
  eyebrow: typography.eyebrow,
  detail: typography.body,
  headerSpacing: { marginBottom: spacing.lg },
  actions: { gap: spacing.md },
  markAll: { alignSelf: 'flex-start', minWidth: 170 },
  error: typography.metadata,
  card: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderRadius: radii.lg },
  pressed: { opacity: .72 },
  icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: typography.cardTitle,
  unreadDot: { width: 8, height: 8, borderRadius: 8 },
  body: { ...typography.body, marginTop: spacing.xs },
  time: { ...typography.metadata, marginTop: spacing.sm },
});
