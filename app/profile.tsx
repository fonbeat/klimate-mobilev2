import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FilterBar, Page, State } from '@/components';
import { useAlertSounds } from '@/alert-sounds';
import type { AlertSound, AlertSoundPreferences } from '@/alert-sound-controller';
import { messageOf } from '@/api';
import { PhoneNotifications } from '@/phone-notifications';
import { LegalLinks } from '@/legal-links-view';
import { useSession } from '@/session';
import { radii, spacing, typography } from '@/tokens';
import { useV2Theme } from '@/theme';
import { useAppearance, type Appearance } from '@/appearance';
import type { OrganizationRole, SessionOrganizations } from '@/types';
import { useApiData } from '@/use-api';

type Panel = 'organization' | 'alerts' | null;

function organizationRoleLabel(role: OrganizationRole) {
  if (role === 'owner') return 'Owner';
  if (role === 'administrator') return 'Administrator';
  return 'Viewer';
}

export default function Profile() {
  const { colors } = useV2Theme();
  const { appearance, setAppearance } = useAppearance();
  const sounds = useAlertSounds();
  const [soundBusy, setSoundBusy] = useState(false);
  const [soundMessage, setSoundMessage] = useState('');
  const [testSound, setTestSound] = useState<AlertSound>('monitorDown');
  const { session, signOut, switchOrganization } = useSession();
  const [panel, setPanel] = useState<Panel>(null);
  const [switchingId, setSwitchingId] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const organizations = useApiData<SessionOrganizations>('/v2/sessions/organizations');
  const currentOrganization = useMemo(() => organizations.data?.organizations.find((item) => item.isCurrent || item.tenantId === session?.tenantId), [organizations.data, session?.tenantId]);
  const initials = `${session?.user.firstname?.[0] ?? ''}${session?.user.lastname?.[0] ?? ''}`;

  const saveSound = async (sound: keyof AlertSoundPreferences, enabled: boolean) => {
    setSoundBusy(true); setSoundMessage('');
    try { await sounds.setPreference(sound, enabled); }
    catch { setSoundMessage('Couldn’t save the alert setting. Please try again.'); }
    finally { setSoundBusy(false); }
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
        <State compact loading={organizations.loading} loadingMessage="Loading organizations…" error={organizations.error} onRetry={organizations.reload} />
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
    </View>

    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <SettingsRow icon="notifications-outline" label="Alerts" value="Phone notifications, sounds & vibration" expanded={panel === 'alerts'} onPress={() => setPanel(panel === 'alerts' ? null : 'alerts')} />
      {panel === 'alerts' && <View style={[styles.panel, { borderTopColor: colors.line }]}>
        <PhoneNotifications key={`${session?.user.ID}:${session?.tenantId ?? ''}`} />
        <View style={[styles.insetSeparator, { backgroundColor: colors.line }]} />
        <Text accessibilityRole="header" style={[styles.optionTitle, { color: colors.ink }]}>While using the app</Text>
        <Text style={[styles.message, { color: colors.muted }]}>These controls only change foreground sounds and vibration—not push alerts. Preferences are saved for your account on this phone.</Text>
        <PreferenceRow label="Monitor-down sound" detail="A short two-note chime" value={sounds.preferences.monitorDown} disabled={sounds.loading || soundBusy} onChange={(enabled) => void saveSound('monitorDown', enabled)} />
        <View style={[styles.insetSeparator, { backgroundColor: colors.line }]} />
        <PreferenceRow label="Gateway-offline sound" detail="A distinct, lower two-note chime" value={sounds.preferences.probeDown} disabled={sounds.loading || soundBusy} onChange={(enabled) => void saveSound('probeDown', enabled)} />
        <View style={[styles.insetSeparator, { backgroundColor: colors.line }]} />
        <PreferenceRow label="Vibrate on alerts" detail="For each new outage, even with sounds off. Subject to your phone’s vibration settings." value={sounds.preferences.vibrate} disabled={sounds.loading || soundBusy} onChange={(enabled) => void saveSound('vibrate', enabled)} />
        <FilterBar options={['Monitor', 'Gateway']} value={testSound === 'monitorDown' ? 'Monitor' : 'Gateway'} onChange={(label) => setTestSound(label === 'Monitor' ? 'monitorDown' : 'probeDown')} label="Sound to preview" />
        <Button label="Test sound" variant="secondary" icon="play-outline" disabled={sounds.loading || !sounds.ready || soundBusy} busy={soundBusy} onPress={() => void (async () => {
          setSoundBusy(true); setSoundMessage('');
          try { await sounds.testSound(testSound); setSoundMessage('Test sound played. If you didn’t hear it, check silent mode, volume, and connected headphones.'); }
          catch (error) { setSoundMessage(messageOf(error)); }
          finally { setSoundBusy(false); }
        })()} />
        <Button label="Test vibration" variant="secondary" icon="phone-portrait-outline" disabled={sounds.loading || soundBusy} onPress={() => {
          setSoundMessage('');
          try { sounds.testVibration(); setSoundMessage('Vibration test requested. If you didn’t feel it, check your phone’s vibration settings.'); }
          catch (error) { setSoundMessage(messageOf(error)); }
        }} />
        {!!soundMessage && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.muted }]}>{soundMessage}</Text>}
      </View>}
      <View style={[styles.separator, { backgroundColor: colors.line }]} />
      <AppearanceRow appearance={appearance} onChange={setAppearance} />
      <View style={[styles.separator, { backgroundColor: colors.line }]} />
      <SettingsRow icon="information-circle-outline" label="About Klimate Mobile" value={`Version ${Constants.expoConfig?.version ?? 'Unavailable'}`} />
    </View>

    <LegalLinks />
    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, { backgroundColor: colors.card, borderColor: colors.line }, pressed && styles.pressed]}><Ionicons name="log-out-outline" size={20} color={colors.down} /><Text style={[styles.signOutText, { color: colors.down }]}>Sign out</Text></Pressable>
  </Page></SafeAreaView>;
}

function SettingsRow({ icon, label, value, expanded, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; expanded?: boolean; onPress?: () => void }) {
  const { colors } = useV2Theme();
  const content = <><View style={[styles.rowIcon, { backgroundColor: colors.cardRaised }]}><Ionicons name={icon} size={18} color={colors.blue} /></View><View style={styles.flex}><Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>{value && <Text numberOfLines={1} style={[styles.rowValue, { color: colors.muted }]}>{value}</Text>}</View>{onPress && <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={19} color={colors.muted} />}</>;
  if (!onPress) return <View style={styles.settingsRow}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>{content}</Pressable>;
}

function AppearanceRow({ appearance, onChange }: { appearance: Appearance; onChange: (value: Appearance) => void }) {
  const { colors } = useV2Theme();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 410 || fontScale > 1.15;
  return <View style={[styles.appearanceRow, narrow && styles.appearanceRowNarrow]}>
    <View style={styles.appearanceLabel}><View style={[styles.rowIcon, { backgroundColor: colors.cardRaised }]}><Ionicons name="contrast-outline" size={18} color={colors.blue} /></View><Text style={[styles.rowLabel, { color: colors.ink }]}>Appearance</Text></View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={[styles.appearanceControl, narrow && styles.appearanceControlNarrow, { backgroundColor: colors.cardRaised, borderColor: colors.line }]}>
      {(['light', 'dark', 'system'] as Appearance[]).map((option) => {
        const selected = appearance === option;
        return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${option[0].toUpperCase()}${option.slice(1)} appearance`} onPress={() => onChange(option)} style={({ pressed }) => [styles.appearanceSegment, { backgroundColor: selected ? colors.navy : 'transparent' }, pressed && styles.pressed]}><Text style={[styles.appearanceSegmentText, { color: selected ? colors.onStatus : colors.muted }]}>{option[0].toUpperCase()}{option.slice(1)}</Text></Pressable>;
      })}
    </View>
  </View>;
}

function PreferenceRow({ label, detail, value, disabled, onChange }: { label: string; detail: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useV2Theme();
  return <View style={styles.preferenceRow}><View style={styles.flex}><Text style={[styles.optionTitle, { color: colors.ink }]}>{label}</Text><Text style={[styles.optionMeta, { color: colors.muted }]}>{detail}</Text></View><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.line, true: colors.blue }} thumbColor={colors.card} /></View>;
}

const styles = StyleSheet.create({
  navigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navigationTitle: typography.sectionTitle,
  navigationSpacer: { width: 48 },
  close: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', paddingVertical: spacing.xxl },
  profileAvatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { fontSize: 27, lineHeight: 34, fontWeight: '700' },
  name: { ...typography.pageTitle, fontSize: 24, lineHeight: 30, marginTop: spacing.md, textAlign: 'center' },
  email: { ...typography.body, marginTop: spacing.xs, textAlign: 'center' },
  organizationPill: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radii.round },
  organizationPillText: typography.metadata,
  group: { borderRadius: radii.xl, overflow: 'hidden' },
  settingsRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  appearanceRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  appearanceRowNarrow: { flexWrap: 'wrap' },
  appearanceLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  appearanceControl: { flexDirection: 'row', width: 188, padding: 3, borderRadius: radii.md, borderWidth: 1 },
  appearanceControlNarrow: { width: '100%' },
  appearanceSegment: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  appearanceSegmentText: { fontSize: 12, fontWeight: '700' },
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
  message: typography.metadata,
  signOut: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.xl },
  signOutText: { ...typography.body, fontWeight: '700' },
  flex: { flex: 1 },
  pressed: { opacity: .7 },
});
