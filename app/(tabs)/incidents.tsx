import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Page, PageTitle, State, StatusPill, shared } from '@/components';
import { colors } from '@/theme';
import type { IncidentPage } from '@/types';
import { useApiData } from '@/use-api';

const filters = ['All', 'Pending', 'Resolved'];
export default function Incidents() {
  const result = useApiData<IncidentPage>('/v2/incidents?page=1&pageSize=100');
  const [filter, setFilter] = useState('All');
  const incidents = useMemo(() => (result.data?.incidents ?? []).filter((i) => filter === 'All' || i.status.toLowerCase() === filter.toLowerCase()), [result.data, filter]);
  return <SafeAreaView style={styles.safe} edges={['top']}><Page refreshing={result.refreshing} onRefresh={result.reload}>
    <PageTitle eyebrow="EVENT HISTORY" title="Incidents" detail="Outages and recoveries across all monitors." />
    <View style={styles.filters}>{filters.map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.active]}><Text style={[styles.filterText, filter === item && styles.activeText]}>{item}</Text></Pressable>)}</View>
    <State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !incidents.length ? 'No incidents in this view.' : undefined} />
    {incidents.map((incident) => <Card key={incident.id}><View style={shared.between}><View style={{ flex: 1, paddingRight: 10 }}><Text style={shared.label}>{incident.label}</Text><Text style={styles.monitor}>{incident.monitorLabel} · {incident.type}</Text></View><StatusPill status={incident.status} /></View><Text style={styles.cause}>{incident.rootCause}</Text><View style={styles.time}><Text style={shared.muted}>{incident.startedAt}</Text><Text style={styles.duration}>{incident.duration}</Text></View></Card>)}
  </Page></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, filters: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.line }, filter: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 }, active: { backgroundColor: colors.cardRaised }, filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, activeText: { color: colors.cyan }, monitor: { color: colors.muted, fontSize: 12, marginTop: 4, textTransform: 'uppercase' }, cause: { color: '#C9D4DC', fontSize: 13, lineHeight: 19, paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line }, time: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }, duration: { color: colors.ink, fontSize: 12, fontWeight: '700' } });
