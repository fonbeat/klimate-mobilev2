import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOutagePush } from './alert-sound-controller';
import { openNotification, usePushRegistrationStatus } from './notifications';
import { useV2Theme } from './theme';
import { radii, spacing, typography } from './tokens';

export function ForegroundOutageBanner({ scope }: { scope: string }) {
  const { colors } = useV2Theme();
  const { top } = useSafeAreaInsets();
  const { confirmedScope } = usePushRegistrationStatus();
  const [alert, setAlert] = useState<{ title: string; data: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android' || confirmedScope !== scope) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // Android ties system heads-up alerts to native sound. Show the visual cue
    // in app and let the existing foreground controller handle audio and haptics.
    const received = Notifications.addNotificationReceivedListener(({ request }) => {
      const { data } = request.content;
      if (!data || AppState.currentState !== 'active' || !isOutagePush(data)) return;
      clearTimeout(timeout);
      setAlert({ title: data.type === 'monitor_down' ? 'Monitor down' : 'Gateway offline', data });
      timeout = setTimeout(() => setAlert(null), 7000);
    });
    const foreground = AppState.addEventListener('change', (state) => { if (state !== 'active') setAlert(null); });
    return () => { clearTimeout(timeout); received.remove(); foreground.remove(); };
  }, [scope, confirmedScope]);

  if (!alert || confirmedScope !== scope) return null;
  return <View pointerEvents="box-none" style={[styles.overlay, { top: top + spacing.xs }]}>
    <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${alert.title}. View details`} accessibilityLiveRegion="polite" style={styles.action} onPress={() => { setAlert(null); openNotification(alert.data); }}>
        <Ionicons name="alert-circle-outline" size={22} color={colors.down} importantForAccessibility="no" />
        <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{alert.title}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} importantForAccessibility="no" />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss alert" style={styles.dismiss} onPress={() => setAlert(null)}><Ionicons name="close" size={21} color={colors.muted} /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 10 },
  banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.md, elevation: 6 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: spacing.sm, paddingHorizontal: spacing.md },
  dismiss: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
