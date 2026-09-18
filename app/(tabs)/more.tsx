import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Page, PageTitle, State, StatusPill, shared } from '@/components';
import { useSession } from '@/session';
import { colors } from '@/theme';
import type { MaintenanceView, ProbeView, SessionOrganizations } from '@/types';
import { useApiData } from '@/use-api';
import { messageOf } from '@/api';

type Section = 'maintenance' | 'probes' | 'account';
export default function More() {
  const { session, signOut, switchOrganization } = useSession();
  const [section, setSection] = useState<Section>('maintenance');
  const [switchingId, setSwitchingId] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const maintenance = useApiData<MaintenanceView>('/v2/maintenance');
  const probes = useApiData<ProbeView>('/v2/probes?offset=0&limit=100');
  const organizations = useApiData<SessionOrganizations>('/v2/sessions/organizations');
  const refresh = () => { maintenance.reload(); probes.reload(); };
  return <SafeAreaView style={styles.safe} edges={['top']}><Page refreshing={maintenance.refreshing || probes.refreshing} onRefresh={refresh}>
    <PageTitle eyebrow="ENVIRONMENT CONTEXT" title="More" detail="Schedules, data collectors, and your session." />
    <View style={styles.menu}><Menu icon="calendar-outline" label="Maintenance" active={section === 'maintenance'} onPress={() => setSection('maintenance')} /><Menu icon="hardware-chip-outline" label="Probes" active={section === 'probes'} onPress={() => setSection('probes')} /><Menu icon="person-outline" label="Account" active={section === 'account'} onPress={() => setSection('account')} /></View>
    {section === 'maintenance' && <>
      <View style={styles.sectionHeading}><Text style={shared.sectionTitle}>Maintenance windows</Text>{maintenance.data && <Text style={styles.count}>{maintenance.data.header.active} active · {maintenance.data.header.upcoming} upcoming</Text>}</View>
      <State loading={maintenance.loading} error={maintenance.error} onRetry={maintenance.reload} empty={!maintenance.loading && !maintenance.data?.records.length ? 'No maintenance windows.' : undefined} />
      {maintenance.data?.records.map((item) => <Card key={item.id}><View style={shared.between}><Text style={[shared.label, { flex: 1 }]}>{item.name}</Text><StatusPill status={item.status} /></View><Text style={styles.description}>{item.description || `${item.targetCount} target${item.targetCount === 1 ? '' : 's'}`}</Text><Text style={styles.schedule}>{item.schedule.startDate} · {item.schedule.startTime}–{item.schedule.endTime} {item.timezone}</Text></Card>)}
    </>}
    {section === 'probes' && <>
      <Text style={shared.sectionTitle}>Probes</Text><State loading={probes.loading} error={probes.error} onRetry={probes.reload} empty={!probes.loading && !probes.data?.probes.length ? 'No probes registered.' : undefined} />
      {probes.data?.probes.map((probe) => <Card key={probe.id}><View style={shared.between}><View style={{ flex: 1 }}><Text style={shared.label}>{probe.name}</Text><Text style={styles.description}>{probe.location || probe.privateIp}</Text></View><StatusPill status={probe.status} /></View><View style={styles.probeMeta}><Text style={styles.metaStrong}>{probe.assignedWork.targetCount} targets · {probe.assignedWork.monitorCount} monitors</Text><Text style={shared.muted}>{probe.lastSeen}</Text></View></Card>)}
    </>}
    {section === 'account' && <>
      <Text style={shared.sectionTitle}>Signed in</Text><Card><View style={styles.accountIcon}><Text style={styles.accountInitials}>{session?.user.firstname?.[0]}{session?.user.lastname?.[0]}</Text></View><Text style={styles.accountName}>{session?.user.firstname} {session?.user.lastname}</Text><Text style={styles.accountEmail}>{session?.user.email}</Text></Card>
      <Text style={shared.sectionTitle}>Organization</Text>
      <State loading={organizations.loading} error={organizations.error} onRetry={organizations.reload} />
      {organizations.data?.organizations.map((organization) => {
        const current = organization.isCurrent || organization.tenantId === session?.tenantId;
        const switching = switchingId === organization.tenantId;
        return <Pressable key={organization.tenantId} disabled={current || !!switchingId} onPress={() => void (async () => {
          setSwitchingId(organization.tenantId); setOrganizationError('');
          try { await switchOrganization(organization.tenantId); }
          catch (error) { setOrganizationError(messageOf(error)); }
          finally { setSwitchingId(''); }
        })()} style={({ pressed }) => [styles.organization, current && styles.organizationCurrent, pressed && !current && { opacity: .78 }]}>
          <View style={[styles.organizationIcon, current && styles.organizationIconCurrent]}><Ionicons name="business" size={19} color={current ? colors.deep : colors.cyan} /></View>
          <View style={{ flex: 1 }}><View style={styles.organizationTitle}><Text style={styles.organizationName}>{organization.name}</Text>{current && <Text style={styles.currentLabel}>CURRENT</Text>}</View><Text style={styles.organizationMeta}>{organization.role} · {organization.accountNo}</Text></View>
          {switching ? <ActivityIndicator color={colors.cyan} /> : <Ionicons name={current ? 'checkmark-circle' : 'chevron-forward'} size={20} color={current ? colors.up : colors.muted} />}
        </Pressable>;
      })}
      {!!organizationError && <Text style={styles.organizationError}>{organizationError}</Text>}
      <Pressable onPress={() => void signOut()} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </>}
  </Page></SafeAreaView>;
}

function Menu({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.menuItem, active && styles.menuActive]}><Ionicons name={icon} size={18} color={active ? colors.deep : colors.muted} /><Text style={[styles.menuText, active && styles.menuTextActive]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, menu: { flexDirection: 'row', gap: 8 }, menuItem: { flex: 1, height: 66, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }, menuActive: { backgroundColor: colors.cyan, borderColor: colors.cyan }, menuText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, menuTextActive: { color: colors.deep }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, count: { color: colors.muted, fontSize: 11 }, description: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 }, schedule: { color: colors.cyan, fontSize: 11, fontWeight: '700', marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }, probeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }, metaStrong: { color: colors.ink, fontSize: 12, fontWeight: '700' }, accountIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: 8 }, accountInitials: { color: colors.deep, fontSize: 18, fontWeight: '900' }, accountName: { color: colors.ink, textAlign: 'center', fontSize: 20, fontWeight: '800' }, accountEmail: { color: colors.muted, textAlign: 'center', fontSize: 13, marginTop: 4 }, organization: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }, organizationCurrent: { borderColor: '#25684E', backgroundColor: '#122C25' }, organizationIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep }, organizationIconCurrent: { backgroundColor: colors.up }, organizationTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 }, organizationName: { color: colors.ink, fontSize: 14, fontWeight: '800', flexShrink: 1 }, currentLabel: { color: colors.up, fontSize: 9, fontWeight: '900', letterSpacing: .7 }, organizationMeta: { color: colors.muted, fontSize: 11, marginTop: 4, textTransform: 'capitalize' }, organizationError: { color: colors.down, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 }, signOut: { height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#6E3039', borderRadius: 11, marginTop: 20 }, signOutText: { color: colors.down, fontWeight: '800' } });
