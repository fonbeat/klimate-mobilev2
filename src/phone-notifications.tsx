import { useCallback, useRef, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from './components';
import { messageOf } from './api';
import { phoneNotificationPermission, pushProjectId, requestPushNotifications } from './notifications';
import { phonePermissionLabel, type PhonePermission } from './push-alert-policy';
import { useSession } from './session';
import { useV2Theme } from './theme';
import { spacing, typography } from './tokens';

export function PhoneNotifications() {
  const { colors } = useV2Theme();
  const { session } = useSession();
  const [permission, setPermission] = useState<PhonePermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const revision = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++revision.current;
    try {
      const next = await phoneNotificationPermission();
      if (mounted.current && id === revision.current) setPermission(next);
    } catch {
      if (mounted.current && id === revision.current) setMessage('Couldn’t check notification permission. Reopen Alerts to try again.');
    }
  }, []);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    void refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setMessage(''); void refresh(); }
    });
    return () => { mounted.current = false; revision.current++; listener.remove(); };
  }, [refresh]));

  const allow = async () => {
    if (!session?.accessToken || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await requestPushNotifications(session.accessToken);
      if (mounted.current) setMessage(result === 'registered' ? 'This phone is registered for downtime alerts.' : result === 'denied' ? 'Allow notifications in your phone’s settings to receive downtime alerts.' : 'Push delivery requires a configured Klimate app build. Foreground sounds and vibration still work.');
    } catch (error) { if (mounted.current) setMessage(`Couldn’t register this phone: ${messageOf(error)}`); }
    finally { if (mounted.current) { setBusy(false); await refresh(); } }
  };
  const allowed = permission === 'allowed' || permission === 'quiet';
  return <View style={{ gap: spacing.sm }}>
    <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink }]}>Phone notifications</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: allowed ? colors.up : colors.attention }} />
      <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.ink, flex: 1 }]}>{permission ? phonePermissionLabel(permission) : 'Checking notification permission…'}</Text>
    </View>
    <Text style={[typography.metadata, { color: colors.muted }]}>Monitor-down and gateway-offline push alerts are kept enabled by Klimate Mobile. Your phone must allow notifications to receive them when the app is closed.</Text>
    {permission === 'quiet' && <Text style={[typography.metadata, { color: colors.muted }]}>Your phone currently delivers notifications quietly. Change this in phone settings if you want banners and sounds.</Text>}
    {!pushProjectId() && <Text style={[typography.metadata, { color: colors.attention }]}>Push delivery is not configured in this build. Phone permission alone does not enable delivery.</Text>}
    {permission !== 'unavailable' && <>
      {permission !== null && (!allowed || !!pushProjectId()) && <Button label={allowed ? 'Check push registration' : 'Allow notifications'} icon="notifications-outline" variant="secondary" busy={busy} onPress={() => void allow()} />}
      <Button label="Open phone settings" icon="settings-outline" variant="secondary" disabled={busy} onPress={() => void Linking.openSettings().catch((error) => { if (mounted.current) setMessage(messageOf(error)); })} />
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={[typography.metadata, { color: colors.muted }]}>{message}</Text>}
  </View>;
}
