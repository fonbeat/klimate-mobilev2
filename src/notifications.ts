import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';
import { notificationDestination } from './notification-routing';
import { darkColors } from './tokens';

export { notificationDestination } from './notification-routing';

export const INSTALLATION_KEY = 'klimate.installation.v1';
export type PushRegistrationResult = 'registered' | 'denied' | 'unavailable';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const next = `klimate-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await SecureStore.setItemAsync(INSTALLATION_KEY, next);
  return next;
}

async function configureNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('incidents', {
      name: 'Incidents', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250], lightColor: darkColors.blue,
    });
  }
}

async function registerPushToken(accessToken: string, token?: string) {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return false;
  const pushToken = token ?? (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api('/v2/push/devices', {
    method: 'PUT', token: accessToken,
    body: JSON.stringify({ installationId: await getInstallationId(), expoPushToken: pushToken, platform: Platform.OS }),
  });
  return true;
}

export async function requestPushNotifications(accessToken: string): Promise<PushRegistrationResult> {
  if (!Device.isDevice || Platform.OS === 'web') return 'unavailable';
  await configureNotifications();
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';
  return await registerPushToken(accessToken) ? 'registered' : 'unavailable';
}

export function usePushRegistration(accessToken?: string) {
  useEffect(() => {
    if (!accessToken || !Device.isDevice || Platform.OS === 'web') return;
    let active = true;
    let subscription: Notifications.EventSubscription | undefined;
    void (async () => {
      await configureNotifications();
      const permission = await Notifications.getPermissionsAsync();
      if (permission.status === 'granted' && active) await registerPushToken(accessToken);
      if (active) subscription = Notifications.addPushTokenListener((token) => {
        void registerPushToken(accessToken, token.data).catch(() => undefined);
      });
    })().catch(() => undefined);
    return () => { active = false; subscription?.remove(); };
  }, [accessToken]);
}

function openNotification(data: Record<string, unknown> = {}) {
  const destination = notificationDestination(data);
  if (destination) router.push(destination);
}

export function useNotificationNavigation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => openNotification(response.notification.request.content.data));
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        openNotification(response.notification.request.content.data);
        void Notifications.clearLastNotificationResponseAsync();
      }
    });
    return () => subscription.remove();
  }, [enabled]);
}
