import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Page, State } from '@/components';
import { messageOf } from '@/api';
import { requestPushNotifications } from '@/notifications';
import { useSession } from '@/session';
import { radii, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import type { OrganizationRole, PushPreferences, SessionOrganizations } from '@/types';
import { useApiData, useAuthenticatedRequest } from '@/use-api';

type Panel = 'organization' | 'notifications' | null;

function organizationRoleLabel(role: OrganizationRole) {
  if (role === 'owner') return 'Owner';
  if (role === 'administrator') return 'Administrator';
  return 'Viewer';
}

export default function Profile() {
  const { colors, scheme } = useV2Theme();
  const { session, signOut, switchOrganization } = useSession();
  const request = useAuthenticatedRequest();
  const [panel, setPanel] = useState<Panel>(null);
  const [switchingId, setSwitchingId] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const [preferenceBusy, setPreferenceBusy] = useState<keyof PushPreferences | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const organizations = useApiData<SessionOrganizations>('/v2/sessions/organizations');
  const preferences = useApiData<PushPreferences>('/v2/push/preferences', panel === 'notifications');
  const currentOrganization = useMemo(() => organizations.data?.organizations.find((item) => item.isCurrent || item.tenantId === session?.tenantId), [organizations.data, session?.tenantId]);
  const initials = `${session?.user.firstname?.[0] ?? ''}${session?.user.lastname?.[0] ?? ''}`;

  const savePreference = async (key: keyof PushPreferences, value: boolean) => {
    if (!preferences.data || preferenceBusy) return;
    setPreferenceBusy(key); setNotificationMessage('');
    try {
      const saved = await request<PushPreferences>('/v2/push/preferences', { method: 'PATCH', body: JSON.stringify({ ...preferences.data, [key]: value }) });
      preferences.setData(saved);
    } catch (error) { setNotificationMessage(messageOf(error)); }
    finally { setPreferenceBusy(null); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}><Page refreshing={organizations.refreshing} onRefresh={organizations.reload}>
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={() => router.back()} style={({ pressed }) => [styles.close, { backgroundColor: colors.card, borderColor: colors.line }, pressed && styles.pressed]}><Ionicons name="close" size={25} color={colors.ink} /></Pressable>
      <Text accessibilityRole="header" style={[styles.navigationTitle, { color: colors.ink }]}>Profile & Preferences</Text>
      <View style={styles.navigationSpacer} />
    </View>

    <View style={styles.identity}>
      <View style={[styles.profileAvatar, { backgroundColor: colors.cardRaised, borderColor: colors.line }]}><Text style={[styles.profileInitials, { color: colors.blue }]}>{initials}</Text></View>
      <Text style={[styles.name, { color: colors.ink }]}>{session?.user.firstname} {session?.user.lastname}</Text>
      <Text style={[styles.email, { color: colors.muted }]}>{session?.user.email}</Text>
      {!!currentOrganization && <View style={[styles.organizationPill, { backgroundColor: colors.cardRaised }]}><Ionicons name="business-outline" size={14} color={colors.blue} /><Text style={[styles.organizationPillText, { color: colors.muted }]}>{currentOrganization.name}</Text></View>}
    </View>

    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <SettingsRow icon="business-outline" label="Organization" value={currentOrganization?.name ?? 'Choose organization'} expanded={panel === 'organization'} onPress={() => setPanel(panel === 'organization' ? null : 'organization')} />
      {panel === 'organization' && <View style={[styles.panel, { borderTopColor: colors.line }]}>
        <State compact loading={organizations.loading} error={organizations.error} onRetry={organizations.reload} />
        {organizations.data?.organizations.map((organization) => {
          const current = organization.isCurrent || organization.tenantId === session?.tenantId;
          const switching = switchingId === organization.tenantId;
          return <Pressable key={organization.tenantId} accessibilityRole="button" accessibilityState={{ selected: current, disabled: current || !!switchingId, busy: switching }} disabled={current || !!switchingId} onPress={() => void (async () => { setSwitchingId(organization.tenantId); setOrganizationError(''); try { await switchOrganization(organization.tenantId); } catch (error) { setOrganizationError(messageOf(error)); } finally { setSwitchingId(''); } })()} style={({ pressed }) => [styles.organizationOption, { borderColor: current ? colors.navy : colors.line, backgroundColor: current ? colors.cardRaised : colors.canvas }, pressed && styles.pressed]}>
            <View style={styles.flex}><Text style={[styles.optionTitle, { color: colors.ink }]}>{organization.name}</Text><Text style={[styles.optionMeta, { color: colors.muted }]}>{organizationRoleLabel(organization.role)} · {organization.accountNo}</Text></View>
            {switching ? <ActivityIndicator color={colors.navy} /> : <Ionicons name={current ? 'checkmark-circle' : 'chevron-forward'} size={20} color={current ? colors.up : colors.muted} />}
          </Pressable>;
        })}
        {!!organizationError && <Text accessibilityLiveRegion="assertive" style={[styles.message, { color: colors.down }]}>{organizationError}</Text>}
      </View>}
      <View style={[styles.separator, { backgroundColor: colors.line }]} />
      <SettingsRow icon="notifications-outline" label="Notifications" value="Operational alerts" expanded={panel === 'notifications'} onPress={() => setPanel(panel === 'notifications' ? null : 'notifications')} />
      {panel === 'notifications' && <View style={[styles.panel, { borderTopColor: colors.line }]}>
        <State compact loading={preferences.loading} error={preferences.error} onRetry={preferences.reload} />
        {preferences.data && <><PreferenceRow label="Monitor goes down" detail="After the outage debounce window" value={preferences.data.monitorDown} disabled={!!preferenceBusy} onChange={(value) => void savePreference('monitorDown', value)} /><View style={[styles.insetSeparator, { backgroundColor: colors.line }]} /><PreferenceRow label="Probe goes offline" detail="After missed heartbeats are confirmed" value={preferences.data.probeOffline} disabled={!!preferenceBusy} onChange={(value) => void savePreference('probeOffline', value)} /></>}
        <View style={styles.enableButton}><Button label="Enable notifications" variant="secondary" icon="notifications-outline" busy={notificationBusy} disabled={!session?.accessToken} onPress={() => void (async () => { if (!session?.accessToken) return; setNotificationBusy(true); setNotificationMessage(''); try { const result = await requestPushNotifications(session.accessToken); setNotificationMessage(result === 'registered' ? 'Notifications are enabled.' : result === 'denied' ? 'Notifications remain disabled in system settings.' : 'Push notifications are unavailable on this device.'); } catch (error) { setNotificationMessage(messageOf(error)); } finally { setNotificationBusy(false); } })()} /></View>
        {!!notificationMessage && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.muted }]}>{notificationMessage}</Text>}
      </View>}
    </View>

    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <SettingsRow icon="contrast-outline" label="Appearance" value={scheme === 'dark' ? 'Dark · follows device' : 'Light · follows device'} />
      <View style={[styles.separator, { backgroundColor: colors.line }]} />
      <SettingsRow icon="information-circle-outline" label="About Klimate" value={`Version ${Constants.expoConfig?.version ?? '0.1.0'}`} />
    </View>

    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, { backgroundColor: colors.card, borderColor: colors.line }, pressed && styles.pressed]}><Ionicons name="log-out-outline" size={20} color={colors.down} /><Text style={[styles.signOutText, { color: colors.down }]}>Sign out</Text></Pressable>
  </Page></SafeAreaView>;
}

function SettingsRow({ icon, label, value, expanded, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; expanded?: boolean; onPress?: () => void }) {
  const { colors } = useV2Theme();
  const content = <><View style={[styles.rowIcon, { backgroundColor: colors.cardRaised }]}><Ionicons name={icon} size={18} color={colors.blue} /></View><View style={styles.flex}><Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>{value && <Text numberOfLines={1} style={[styles.rowValue, { color: colors.muted }]}>{value}</Text>}</View>{onPress && <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={19} color={colors.muted} />}</>;
  if (!onPress) return <View style={styles.settingsRow}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>{content}</Pressable>;
}

function PreferenceRow({ label, detail, value, disabled, onChange }: { label: string; detail: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useV2Theme();
  return <View style={styles.preferenceRow}><View style={styles.flex}><Text style={[styles.optionTitle, { color: colors.ink }]}>{label}</Text><Text style={[styles.optionMeta, { color: colors.muted }]}>{detail}</Text></View><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.line, true: colors.blue }} thumbColor={colors.card} /></View>;
}

const styles = StyleSheet.create({
  navigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navigationTitle: typography.sectionTitle,
  navigationSpacer: { width: 44 },
  close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', paddingVertical: spacing.xxl },
  profileAvatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { fontSize: 27, lineHeight: 34, fontWeight: '700' },
  name: { ...typography.pageTitle, fontSize: 24, lineHeight: 30, marginTop: spacing.md, textAlign: 'center' },
  email: { ...typography.body, marginTop: spacing.xs, textAlign: 'center' },
  organizationPill: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radii.round },
  organizationPillText: typography.metadata,
  group: { borderRadius: radii.xl, borderWidth: 1, overflow: 'hidden' },
  settingsRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: typography.cardTitle,
  rowValue: { ...typography.metadata, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  panel: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm },
  organizationOption: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radii.md },
  optionTitle: typography.cardTitle,
  optionMeta: { ...typography.metadata, marginTop: 2, textTransform: 'capitalize' },
  preferenceRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  insetSeparator: { height: StyleSheet.hairlineWidth },
  enableButton: { marginTop: spacing.sm },
  message: typography.metadata,
  signOut: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.xl },
  signOutText: { ...typography.body, fontWeight: '700' },
  flex: { flex: 1 },
  pressed: { opacity: .7 },
});
