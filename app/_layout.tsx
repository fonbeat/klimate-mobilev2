import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/session';
import { useNotificationNavigation, usePushRegistration } from '@/notifications';
import { useV2Theme } from '@/theme';
import { StatusViewProvider } from '@/status-view';
import { AppearanceProvider, useAppearance } from '@/appearance';
import { InboxBadgeProvider } from '@/inbox-badge';
import { CapabilitiesProvider } from '@/capabilities';
import { AlertSoundsProvider } from '@/alert-sounds';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { session, loading } = useSession();
  const { loading: appearanceLoading } = useAppearance();
  const { colors, scheme } = useV2Theme();
  usePushRegistration(session?.accessToken);
  useNotificationNavigation(!!session);
  useEffect(() => { if (!loading && !appearanceLoading) void SplashScreen.hideAsync(); }, [loading, appearanceLoading]);
  if (loading || appearanceLoading) return null;
  return (
    <><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="status/[view]/[id]" />
        <Stack.Screen name="probe/[id]" />
        <Stack.Screen name="incident/[id]" />
      </Stack.Protected>
    </Stack></>
  );
}

export default function RootLayout() {
  return <AppearanceProvider><SessionProvider><AlertSoundsProvider><CapabilitiesProvider><InboxBadgeProvider><StatusViewProvider><Navigation /></StatusViewProvider></InboxBadgeProvider></CapabilitiesProvider></AlertSoundsProvider></SessionProvider></AppearanceProvider>;
}
