import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { isOutagePush } from './alert-sound-controller';
import { api } from './api';
import { notificationDestination } from './notification-routing';
import { darkColors } from './tokens';
import { ensureOutagePushEnabled, type PhonePermission } from './push-alert-policy';
import type { PushPreferences } from './types';

export { notificationDestination } from './notification-routing';

export const INSTALLATION_KEY = 'klimate.installation.v1';
export type PushRegistrationResult = 'registered' | 'denied' | 'unavailable';

export function syncAppBadge(unread: number) {
  if (Platform.OS === 'web') return;
  void Notifications.setBadgeCountAsync(Math.max(0, unread)).catch(() => undefined);
}

Notifications.setNotificationHandler({
  // Foreground outage audio is owned by the cursor-based listener, not both paths.
  handleNotification: async (notification) => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !(AppState.currentState === 'active' && isOutagePush(notification.request.content.data)), shouldSetBadge: true }),
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

export function pushProjectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

function permissionAllowed(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL || permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

export async function phoneNotificationPermission(): Promise<PhonePermission> {
  if (!Device.isDevice || Platform.OS === 'web') return 'unavailable';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'quiet';
  if (permissionAllowed(permission)) {
    if (Platform.OS === 'android') {
      const channel = await Notifications.getNotificationChannelAsync('incidents');
      if (channel?.importance === Notifications.AndroidImportance.NONE) return 'blocked';
    }
    return 'allowed';
  }
  return permission.status === 'undetermined' ? 'notRequested' : 'blocked';
}

async function syncOutagePreferences(accessToken: string, current = () => true) {
  return ensureOutagePushEnabled(
    () => api<PushPreferences>('/v2/push/preferences', { token: accessToken }),
    (preferences) => api('/v2/push/preferences', { method: 'PATCH', token: accessToken, body: JSON.stringify(preferences) }),
    current,
  );
}

async function registerPushToken(accessToken: string, current = () => true) {
  const projectId = pushProjectId();
  if (!projectId) return false;
  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!current()) return false;
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
  if (!permissionAllowed(permission) && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!permissionAllowed(permission)) return 'denied';
  if (await phoneNotificationPermission() === 'blocked') return 'denied';
  await syncOutagePreferences(accessToken);
  return await registerPushToken(accessToken) ? 'registered' : 'unavailable';
}

export function usePushRegistration(accessToken?: string) {
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    let syncing = false;
    let subscription: Notifications.EventSubscription | undefined;
    const sync = async () => {
      if (!active || syncing || AppState.currentState !== 'active') return;
      syncing = true;
      try {
        if (!await syncOutagePreferences(accessToken, () => active)) return;
        if (!Device.isDevice || Platform.OS === 'web') return;
        await configureNotifications();
        const permission = await Notifications.getPermissionsAsync();
        if (permissionAllowed(permission) && active) await registerPushToken(accessToken, () => active);
      } finally { syncing = false; }
    };
    void sync().catch(() => undefined);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync().catch(() => undefined);
    });
    if (Device.isDevice && Platform.OS !== 'web') subscription = Notifications.addPushTokenListener(() => {
      // Native APNs/FCM token changes require a fresh Expo token, not passing the native token as an Expo token.
      void sync().catch(() => undefined);
    });
    return () => { active = false; foreground.remove(); subscription?.remove(); };
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
