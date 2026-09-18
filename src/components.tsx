import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, statusColor } from './theme';

export function Page({ children, refreshing = false, onRefresh }: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>) {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} /> : undefined}>{children}</ScrollView>;
}

export function PageTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <View style={styles.heading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.detail}>{detail}</Text></View>;
}

export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }

export function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
  return <View style={[styles.pill, { backgroundColor: `${color}18` }]}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.pillText, { color }]}>{status || 'Unknown'}</Text></View>;
}

export function State({ loading, error, empty, onRetry }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void }) {
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.navy} /><Text style={styles.stateText}>Checking your environment…</Text></View>;
  if (error) return <View style={styles.state}><Ionicons name="cloud-offline-outline" size={28} color={colors.down} /><Text style={styles.stateTitle}>Couldn’t refresh Klimate</Text><Text style={styles.stateText} onPress={onRetry}>{error}</Text></View>;
  if (empty) return <View style={styles.state}><Ionicons name="checkmark-circle-outline" size={30} color={colors.up} /><Text style={styles.stateTitle}>{empty}</Text></View>;
  return null;
}

export const shared = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 12, marginTop: 8 },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 42, gap: 14 },
  heading: { paddingVertical: 12, gap: 6 },
  eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '800', letterSpacing: -1.2 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: 14, padding: 17 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99 },
  dot: { width: 7, height: 7, borderRadius: 7 },
  pillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30 },
  stateTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
