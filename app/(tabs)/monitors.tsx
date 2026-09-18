import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Page, PageTitle, State, StatusPill, shared } from '@/components';
import { colors } from '@/theme';
import type { MonitorPage } from '@/types';
import { useApiData } from '@/use-api';

const filters = ['All', 'Down', 'Attention', 'Up', 'Unknown'];
export default function Monitors() {
  const result = useApiData<MonitorPage>('/v2/status/monitors?offset=0&limit=100');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const records = useMemo(() => (result.data?.records ?? []).filter((m) => (filter === 'All' || m.status.toLowerCase() === filter.toLowerCase()) && (!search || `${m.label} ${m.monitorLabel} ${m.host} ${m.type}`.toLowerCase().includes(search.toLowerCase()))), [result.data, filter, search]);
  return <SafeAreaView style={styles.safe} edges={['top']}><Page refreshing={result.refreshing} onRefresh={result.reload}>
    <PageTitle eyebrow="LIVE ENVIRONMENT" title="Monitors" detail="Every check, in one glance." />
    <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search name, host, or type" placeholderTextColor={colors.muted} style={styles.input} /></View>
    <View style={styles.filters}>{filters.map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View>
    <State loading={result.loading} error={result.error} onRetry={result.reload} empty={!result.loading && !records.length ? 'No monitors match this view.' : undefined} />
    {records.map((monitor) => <Card key={monitor.monitorID ?? monitor.ID}><View style={shared.between}><View style={{ flex: 1, paddingRight: 10 }}><Text style={shared.label}>{monitor.displayName || monitor.label}</Text><Text style={styles.host} numberOfLines={1}>{monitor.host || monitor.monitorLabel}</Text></View><StatusPill status={monitor.status} /></View><View style={styles.meta}><Text style={styles.type}>{monitor.type}</Text><Text style={shared.muted}>{monitor.rtt || monitor.lastChecked}</Text></View>{!!monitor.statusMessage && <Text style={styles.message}>{monitor.statusMessage}</Text>}</Card>)}
  </Page></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, search: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }, input: { flex: 1, color: colors.ink, fontSize: 14 }, filters: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, filter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }, filterActive: { backgroundColor: colors.cyan, borderColor: colors.cyan }, filterText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, filterTextActive: { color: colors.deep }, host: { color: colors.muted, fontSize: 13, marginTop: 4 }, meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }, type: { color: colors.cyan, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, message: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 } });
