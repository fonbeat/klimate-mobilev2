import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/session';
import { useNotificationNavigation, usePushRegistration } from '@/notifications';
import { useV2Theme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { session, loading } = useSession();
  const { colors, scheme } = useV2Theme();
  usePushRegistration(session?.accessToken);
  useNotificationNavigation(!!session);
  useEffect(() => { if (!loading) void SplashScreen.hideAsync(); }, [loading]);
  if (loading) return null;
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
      </Stack.Protected>
    </Stack></>
  );
}

export default function RootLayout() {
  return <SessionProvider><Navigation /></SessionProvider>;
}
