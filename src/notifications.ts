import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { isOutagePush } from './alert-sound-controller';
import { ApiError, api } from './api';
import { PushLifecycle, singleFlightInstallation, type PendingPushRemoval, type PushLease } from './push-lifecycle';
import { sessionScope } from './session-authority';
import { notificationDestination } from './notification-routing';
import { darkColors } from './tokens';
import { ensureOutagePushEnabled, type PhonePermission } from './push-alert-policy';
import type { PushPreferences, Session } from './types';

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

const installation = singleFlightInstallation(
  () => SecureStore.getItemAsync(INSTALLATION_KEY),
  (id) => SecureStore.setItemAsync(INSTALLATION_KEY, id),
  () => `klimate-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
export async function getInstallationId() { return (await installation())!; }

const CLEANUP_KEY = 'klimate.push.pending-removals.v1';
let authenticatedRead: typeof api | undefined;
let cleanupWarning = '';
let warningRevision = 0;
const warningListeners = new Set<() => void>();
function warn(message: string) { cleanupWarning = message; warningRevision++; for (const listener of warningListeners) listener(); }
const cleanupMessage = 'Signed out on this phone, but push removal could not be confirmed. Old alerts may still arrive. Cleanup will be retried when you sign in again.';
const lifecycle = new PushLifecycle({
  installation,
  load: async () => {
    const value = JSON.parse(await SecureStore.getItemAsync(CLEANUP_KEY) ?? '[]') as PendingPushRemoval[];
    if (!Array.isArray(value) || !value.every((item) => typeof item.scope === 'string' && typeof item.installationId === 'string')) throw new Error('Push cleanup record is invalid.');
    return value;
  },
  save: async (pending) => {
    if (pending.length) await SecureStore.setItemAsync(CLEANUP_KEY, JSON.stringify(pending));
    else await SecureStore.deleteItemAsync(CLEANUP_KEY);
    if (!pending.length) warn('');
  },
  remove: async (session, id, current) => {
    const path = `/v2/push/devices/${encodeURIComponent(id)}`;
    if (current) { await pushRead({ current, session: () => session }, path, { method: 'DELETE' }); return; }
    try { await api(path, { method: 'DELETE', token: session.accessToken }); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'ACCESS_TOKEN_EXPIRED') throw error;
      // Retired credentials are never published back into the active session.
      const next = await api<Session>('/v2/sessions/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) });
      if (sessionScope(next) !== sessionScope(session)) {
        await api('/v2/sessions/logout', { method: 'POST', body: JSON.stringify({ refreshToken: next.refreshToken }) }).catch(() => undefined);
        throw new Error('The push cleanup organization changed.');
      }
      Object.assign(session, next);
      await api(path, { method: 'DELETE', token: session.accessToken });
    }
  },
});

export function setPushSession(session: Session | null, request?: typeof api) {
  lifecycle.activate(session);
  authenticatedRead = session ? request : undefined;
}

export async function retirePushSession(previous: Session) {
  const retired = { ...previous };
  // Enqueue synchronously, before a subsequent sign-in can register this device.
  const removal = lifecycle.retire(retired);
  void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  try { await removal; }
  catch { warn(cleanupMessage); }
  finally { await api('/v2/sessions/logout', { method: 'POST', body: JSON.stringify({ refreshToken: retired.refreshToken }) }).catch(() => undefined); }
}

export function usePushCleanupWarning() {
  const [message, setMessage] = useState(cleanupWarning);
  useEffect(() => {
    const listener = () => setMessage(cleanupWarning);
    warningListeners.add(listener);
    const revision = warningRevision;
    void SecureStore.getItemAsync(CLEANUP_KEY).then((saved) => { if (revision === warningRevision && saved && saved !== '[]') warn(cleanupMessage); }).catch(() => undefined);
    return () => { warningListeners.delete(listener); };
  }, []);
  return message;
}

async function pushRead<T>(lease: PushLease, path: string, init?: Parameters<typeof api>[1]) {
  if (!lease.current() || !authenticatedRead) throw new Error('The push session changed.');
  const result = await authenticatedRead<T>(path, init);
  if (!lease.current()) throw new Error('The push session changed.');
  return result;
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

async function syncOutagePreferences(lease: PushLease, current = () => true) {
  return ensureOutagePushEnabled(
    () => pushRead<PushPreferences>(lease, '/v2/push/preferences'),
    (preferences) => pushRead(lease, '/v2/push/preferences', { method: 'PATCH', body: JSON.stringify(preferences) }),
    () => current() && lease.current(),
  );
}

async function registerPushToken(lease: PushLease, current = () => true) {
  const projectId = pushProjectId();
  if (!projectId) return false;
  const guarded = { ...lease, current: () => current() && lease.current() };
  return lifecycle.register(guarded,
    async () => (await Notifications.getExpoPushTokenAsync({ projectId })).data,
    async (_session, installationId, token) => { await pushRead(guarded, '/v2/push/devices', { method: 'PUT', body: JSON.stringify({ installationId, expoPushToken: token, platform: Platform.OS }) }); },
  );
}

export async function requestPushNotifications(accessToken: string): Promise<PushRegistrationResult> {
  const lease = lifecycle.capture();
  if (!lease.current() || lease.session().accessToken !== accessToken) return 'unavailable';
  if (!Device.isDevice || Platform.OS === 'web') return 'unavailable';
  await configureNotifications();
  let permission = await Notifications.getPermissionsAsync();
  if (!permissionAllowed(permission) && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!permissionAllowed(permission)) return 'denied';
  if (await phoneNotificationPermission() === 'blocked') return 'denied';
  if (!lease.current()) return 'unavailable';
  await syncOutagePreferences(lease);
  return await registerPushToken(lease) ? 'registered' : 'unavailable';
}

export function usePushRegistration(accessToken?: string) {
  useEffect(() => {
    if (!accessToken) return;
    const lease = lifecycle.capture();
    let active = true;
    let syncing = false;
    let subscription: Notifications.EventSubscription | undefined;
    const sync = async () => {
      if (!active || syncing || AppState.currentState !== 'active') return;
      syncing = true;
      try {
        if (!await syncOutagePreferences(lease, () => active)) return;
        if (!Device.isDevice || Platform.OS === 'web') return;
        await configureNotifications();
        const permission = await Notifications.getPermissionsAsync();
        if (permissionAllowed(permission) && active) await registerPushToken(lease, () => active);
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
