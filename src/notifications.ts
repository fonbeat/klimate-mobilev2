import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

export const INSTALLATION_KEY = 'klimate.installation.v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const next = `klimate-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await SecureStore.setItemAsync(INSTALLATION_KEY, next);
  return next;
}

export function usePushRegistration(accessToken?: string) {
  useEffect(() => {
    if (!accessToken || !Device.isDevice || Platform.OS === 'web') return;
    void (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('incidents', {
          name: 'Incidents',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 180, 250],
          lightColor: '#49C6D4',
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') return;

      const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await api('/v1/push/devices', {
        method: 'PUT',
        token: accessToken,
        body: JSON.stringify({
          installationId: await getInstallationId(),
          expoPushToken: pushToken,
          platform: Platform.OS,
        }),
      });
    })().catch(() => undefined);
  }, [accessToken]);
}
