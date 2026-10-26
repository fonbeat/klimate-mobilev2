import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, SectionTitle, StatusPill } from './components';
import { useV2Theme } from './theme';
import { spacing, typography } from './tokens';
import { incidentDestination } from './report-routing';
import type { Incident } from './types';
import { displayMetric } from './metric-display';
import type { StatusDomain } from './status';

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
export function formatPercent(value?: number | null) { return value == null ? '—' : `${value.toFixed(1)}%`; }

export function ReportHeader({ title, subtitle, status, message, domain = 'monitor' }: { title: string; subtitle: string; status: string; message?: string; domain?: StatusDomain }) {
  const { colors } = useV2Theme();
  return <Card><Text style={[styles.metadata, { color: colors.muted }]}>{subtitle}</Text><View style={styles.row}><Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text><StatusPill status={status} domain={domain} /></View>{!!message && <Text style={[styles.body, { color: colors.muted }]}>{message}</Text>}</Card>;
}

export function DetailCard({ rows }: { rows: [string, string | undefined | null][] }) {
  const { colors } = useV2Theme();
  return <Card>{rows.filter(([, value]) => value != null && value !== '').map(([label, value], index) => <View key={`${label}-${index}`} style={[styles.detail, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><Text selectable style={[styles.value, { color: colors.ink }]}>{displayMetric(value)}</Text></View>)}</Card>;
}

export function Notice({ children }: { children: string }) {
  const { colors } = useV2Theme();
  return <Card><Text style={[typography.body, { color: colors.muted }]}>{children}</Text></Card>;
}

export function IncidentRows({ incidents, title = 'Recent incidents' }: { incidents: Incident[]; title?: string }) {
  const { colors } = useV2Theme();
  if (!incidents.length) return null;
  return <><SectionTitle>{title}</SectionTitle>{incidents.map((incident) => {
    const destination = incidentDestination(incident);
    return <Pressable key={incident.id} accessibilityRole={destination ? 'button' : undefined} disabled={!destination} onPress={() => destination && router.push(destination as Href)}><Card><View style={styles.row}><Text style={[styles.value, { color: colors.ink }]}>{incident.rootCause || incident.label || 'Incident'}</Text><StatusPill status={incident.status} domain="incident" /></View><Text style={[styles.metadata, { color: colors.muted }]}>{formatDate(incident.startedAt)} · {incident.duration}</Text></Card></Pressable>;
  })}</>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  title: { ...typography.pageTitle, fontSize: 23, lineHeight: 29, flex: 1 },
  body: { ...typography.body, marginTop: spacing.sm }, metadata: typography.metadata,
  detail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 50, paddingVertical: spacing.sm },
  label: { ...typography.metadata, flex: .55 }, value: { ...typography.body, flex: 1 },
});
