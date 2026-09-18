import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Page, State, StatusPill, shared } from '@/components';
import { colors, statusColor } from '@/theme';
import type { AttentionCenter, IncidentPage, StatusSummary } from '@/types';
import { useApiData } from '@/use-api';
import { useSession } from '@/session';

export default function Overview() {
  const { session } = useSession();
  const summary = useApiData<StatusSummary>('/v2/status/summary');
  const attention = useApiData<AttentionCenter>('/v2/attention');
  const incidents = useApiData<IncidentPage>('/v2/incidents?page=1&pageSize=5');
  const loading = summary.loading && !summary.data;
  const refresh = () => { summary.reload(); attention.reload(); incidents.reload(); };
  const critical = (summary.data?.downMonitors ?? 0) > 0;
  const operational = summary.data?.totalMonitors ? Math.round((summary.data.upMonitors / summary.data.totalMonitors) * 100) : 100;

  return <SafeAreaView style={styles.safe} edges={['top']}><Page refreshing={summary.refreshing} onRefresh={refresh}>
    <View style={styles.top}><View><Text style={styles.brand}><Text style={styles.brandDot}>● </Text>Klimate</Text><Text style={styles.greeting}>Hello, {session?.user.firstname}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{session?.user.firstname?.[0]}{session?.user.lastname?.[0]}</Text></View></View>
    <State loading={loading} error={summary.error} onRetry={refresh} />
    {summary.data && <>
      <Card><Text style={styles.cardTitle}>Current status</Text><View style={styles.healthRow}>
        <View style={[styles.ringOuter, { borderColor: critical ? '#6E3039' : '#1C6A4A' }]}><View style={[styles.ring, { backgroundColor: critical ? colors.down : colors.up }]}><Ionicons name={critical ? 'arrow-down' : 'arrow-up'} color={colors.deep} size={25} /></View></View>
        <View style={styles.score}><Text style={styles.scoreValue}>{operational}%</Text><Text style={styles.scoreLabel}>monitors operational</Text></View>
      </View><View style={styles.counts}>
        <Metric value={summary.data.downMonitors} label="Down" color={colors.down} />
        <Metric value={summary.data.upMonitors} label="Up" color={colors.up} />
        <Metric value={summary.data.attentionMonitors} label="Attention" color={colors.attention} />
        <Metric value={summary.data.unknownMonitors} label="Unknown" color={colors.unknown} />
      </View></Card>
      {!!attention.data?.count && <><Text style={shared.sectionTitle}>Needs attention</Text>{attention.data.items.slice(0, 3).map((item) => <Card key={item.id}><View style={styles.attention}><Ionicons name={item.severity === 'critical' ? 'alert-circle' : 'warning'} size={22} color={statusColor(item.severity)} /><View style={{ flex: 1 }}><Text style={shared.label}>{item.header}</Text><Text style={shared.muted}>{item.message}</Text></View></View></Card>)}</>}
      <Text style={shared.sectionTitle}>Recent incidents</Text>
      {!incidents.data?.incidents.length ? <Card><Text style={styles.allClear}>All clear — no recent incidents.</Text></Card> : incidents.data.incidents.map((item) => <Card key={item.id}><View style={shared.between}><View style={{ flex: 1, paddingRight: 10 }}><Text style={shared.label}>{item.label}</Text><Text style={shared.muted}>{item.monitorLabel} · {item.startedAt}</Text></View><StatusPill status={item.status} /></View></Card>)}
    </>}
  </Page></SafeAreaView>;
}

function Metric({ value, label, color }: { value: number; label: string; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }, brand: { color: colors.ink, fontSize: 23, fontWeight: '900', letterSpacing: -.8 }, brandDot: { color: colors.cyan }, greeting: { color: colors.muted, fontSize: 12, marginTop: 3 }, avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.cardRaised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.cyan, fontWeight: '800' }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, healthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 23, paddingVertical: 20 }, ringOuter: { width: 82, height: 82, borderRadius: 82, borderWidth: 9, alignItems: 'center', justifyContent: 'center' }, ring: { width: 58, height: 58, borderRadius: 58, alignItems: 'center', justifyContent: 'center' }, score: { gap: 3 }, scoreValue: { color: colors.ink, fontSize: 34, fontWeight: '800' }, scoreLabel: { color: colors.muted, fontSize: 12 }, counts: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 15 }, metric: { flex: 1, alignItems: 'center', gap: 4 }, metricValue: { fontSize: 20, fontWeight: '800' }, metricLabel: { color: colors.muted, fontSize: 10 }, attention: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, allClear: { color: colors.up, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
