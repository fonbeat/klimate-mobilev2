import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Page, RefreshWarning, SectionTitle, State, StatusPill, SummaryStrip } from '@/components';
import { spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { Probe } from '@/types';
import { useApiData } from '@/use-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';

export default function ProbeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useV2Theme();
  const result = useApiData<Probe>(id ? `/v2/gateways/${encodeURIComponent(id)}` : '', !!id);
  useForegroundRefresh(result.refreshBackground);
  const probe = result.data;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><Page refreshing={result.refreshing} onRefresh={result.reload}>
    <View style={styles.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Back to Gateways" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable><Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>Gateway</Text><View style={styles.navigationSpacer} /></View>
    <State loading={result.loading && !probe} loadingMessage="Loading Gateway details…" error={!probe ? result.error : null} onRetry={result.reload} />
    {probe && <RefreshWarning error={result.error} />}
    {probe && <><Card><Text style={[styles.kicker, { color: colors.muted }]}>COLLECTOR</Text><View style={styles.row}><Text style={[styles.title, { color: colors.ink }]}>{probe.name}</Text><StatusPill status={probe.status} domain="probe" /></View><Text style={[styles.subtitle, { color: colors.muted }]}>{probe.location || probe.hostname || 'Location unavailable'}</Text></Card>
      <SummaryStrip items={[{ label: 'Targets', value: probe.assignedWork?.targetCount ?? 0 }, { label: 'Monitors', value: probe.assignedWork?.monitorCount ?? 0 }]} />
      <SectionTitle>Collector details</SectionTitle><Card>
        <Detail label="Software" value={probe.software?.installedVersion} first />
        <Detail label="Last seen" value={probe.lastSeen} />
        <Detail label="Private IP" value={probe.privateIp} />
        <Detail label="Public IP" value={probe.publicIp} />
        <Detail label="Operating system" value={probe.os} />
      </Card>
      <Button label="View Gateway incidents" variant="secondary" onPress={() => router.push({ pathname: '/(tabs)/incidents', params: { kind: 'probe', probeId: id } })} />
    </>}
  </Page></SafeAreaView>;
}

function Detail({ label, value, first = false }: { label: string; value?: string; first?: boolean }) {
  const { colors } = useV2Theme();
  if (!value) return null;
  return <View style={[styles.detail, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><Text style={[styles.value, { color: colors.ink }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  navigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 48, height: 48, alignItems: 'flex-start', justifyContent: 'center' },
  navigationSpacer: { width: 48 },
  heading: typography.sectionTitle,
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  flex: { flex: 1 },
  kicker: { ...typography.metadata, fontWeight: '600' },
  title: { ...typography.pageTitle, fontSize: 23, lineHeight: 29, flex: 1 },
  subtitle: { ...typography.body, marginTop: spacing.sm },
  detail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 50, paddingVertical: spacing.sm },
  label: { ...typography.metadata, flex: 0.42 },
  value: { ...typography.body, flex: 1, textAlign: 'right' },
});
