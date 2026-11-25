import Constants, { ExecutionEnvironment } from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState, useSyncExternalStore } from 'react';
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

const installation = singleFlightInstallation(
  () => SecureStore.getItemAsync(INSTALLATION_KEY),
  (id) => SecureStore.setItemAsync(INSTALLATION_KEY, id),
  () => randomUUID(),
);
export async function getInstallationId() { return (await installation())!; }

const CLEANUP_KEY = 'klimate.push.pending-removals.v1';
let authenticatedRead: typeof api | undefined;
type RegistrationPhase = 'pending' | 'registered' | 'failed' | 'owned' | 'denied' | 'unavailable';
let registration = { scope: '', confirmedScope: '', phase: 'pending' as RegistrationPhase };
const registrationListeners = new Set<() => void>();
function subscribeRegistration(listener: () => void) {
  registrationListeners.add(listener);
  return () => { registrationListeners.delete(listener); };
}
function setRegistration(scope: string, phase: RegistrationPhase, confirmedScope = registration.confirmedScope) {
  if (scope === registration.scope && phase === registration.phase && confirmedScope === registration.confirmedScope) return;
  registration = { scope, phase, confirmedScope };
  for (const listener of registrationListeners) listener();
}
export function usePushRegistrationStatus() {
  return useSyncExternalStore(subscribeRegistration, () => registration);
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const foregroundOutage = AppState.currentState === 'active' && isOutagePush(notification.request.content.data);
    const wrongScope = foregroundOutage && (!registration.scope || registration.phase === 'owned' || (!!registration.confirmedScope && registration.confirmedScope !== registration.scope));
    // The cursor-based listener owns foreground outage audio.
    return { shouldShowBanner: !wrongScope, shouldShowList: !wrongScope, shouldPlaySound: !foregroundOutage, shouldSetBadge: !wrongScope };
  },
});
let cleanupWarning = '';
let warningRevision = 0;
const warningListeners = new Set<() => void>();
function warn(message: string) { cleanupWarning = message; warningRevision++; for (const listener of warningListeners) listener(); }
const cleanupMessage = 'Signed out on this phone, but push removal could not be confirmed. Old alerts may still arrive. Cleanup will be retried when you sign in again.';
const lifecycle = new PushLifecycle({
  installation,
  load: async () => {
    const value = JSON.parse(await SecureStore.getItemAsync(CLEANUP_KEY) ?? '[]') as PendingPushRemoval[];
    if (!Array.isArray(value) || !value.every((item) => item && typeof item.scope === 'string' && typeof item.installationId === 'string')) throw new Error('Push cleanup record is invalid.');
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
  const scope = sessionScope(session);
  if (scope !== registration.scope) {
    if (registration.scope) {
      void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
    setRegistration(scope, 'pending');
  }
}

export async function retirePushSession(previous: Session) {
  const retired = { ...previous };
  // Enqueue synchronously, before a subsequent sign-in can register this device.
  const removal = lifecycle.retire(retired);
  void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  try {
    await removal;
    if (registration.confirmedScope === sessionScope(retired)) setRegistration(registration.scope, registration.phase, '');
  }
  catch { warn(cleanupMessage); }
  finally { await api('/v2/sessions/logout', { method: 'POST', body: JSON.stringify({ refreshToken: retired.refreshToken }) }); }
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
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return undefined;
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
  if (!pushProjectId()) return 'unavailable';
  try {
    await configureNotifications();
    let permission = await Notifications.getPermissionsAsync();
    if (!permissionAllowed(permission) && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permissionAllowed(permission)) {
      if (lease.current()) setRegistration(sessionScope(lease.session()), 'denied');
      return 'denied';
    }
    return await syncPushRegistration(lease);
  } catch (error) {
    if (lease.current()) setRegistration(sessionScope(lease.session()), pushOwnershipConflict(error) ? 'owned' : 'failed');
    throw error;
  }
}

async function syncPushRegistration(lease: PushLease, active = () => true): Promise<PushRegistrationResult> {
  const current = () => active() && lease.current();
  if (!current()) return 'unavailable';
  const scope = sessionScope(lease.session());
  if (!pushProjectId()) { setRegistration(scope, 'unavailable'); return 'unavailable'; }
  const permission = await phoneNotificationPermission();
  if (!current()) return 'unavailable';
  if (permission !== 'allowed' && permission !== 'quiet') { setRegistration(scope, 'denied'); return 'denied'; }
  if (!await syncOutagePreferences(lease, current)) return 'unavailable';
  const registered = await registerPushToken(lease, current);
  if (current() && registered) setRegistration(scope, 'registered', scope);
  return registered ? 'registered' : 'unavailable';
}

function pushOwnershipConflict(error: unknown) {
  return error instanceof ApiError && error.code === 'PUSH_INSTALLATION_OWNED';
}

export function usePushRegistration(scope: string) {
  useEffect(() => {
    if (!scope || !Device.isDevice || Platform.OS === 'web') return;
    const lease = lifecycle.capture();
    if (!lease.current() || sessionScope(lease.session()) !== scope) return;
    if (!pushProjectId()) { setRegistration(scope, 'unavailable'); return; }
    let active = true;
    let syncing = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failureCount = 0;
    const clearRetry = () => { clearTimeout(retry); retry = undefined; };
    const sync = async () => {
      if (!active || syncing || AppState.currentState !== 'active') return;
      clearRetry();
      syncing = true;
      try {
        await configureNotifications();
        await syncPushRegistration(lease, () => active);
        failureCount = 0;
      } catch (error) {
        if (!active || !lease.current()) return;
        if (pushOwnershipConflict(error)) { setRegistration(scope, 'owned'); return; }
        setRegistration(scope, 'failed');
        if (AppState.currentState === 'active') retry = setTimeout(() => void sync(), Math.min(60_000, 5000 * 2 ** Math.min(failureCount++, 4)));
      } finally { syncing = false; }
    };
    void sync();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
      else clearRetry();
    });
    const subscription = Notifications.addPushTokenListener(() => {
      // Native APNs/FCM token changes require a fresh Expo token, not passing the native token as an Expo token.
      void sync();
    });
    return () => { active = false; clearRetry(); foreground.remove(); subscription.remove(); };
  }, [scope]);
}

export function openNotification(data: Record<string, unknown> = {}) {
  const destination = notificationDestination(data);
  if (destination) router.push(destination);
}

export function useNotificationNavigation(scope: string, ready: boolean) {
  useEffect(() => {
    if (!scope || !ready) return;
    const lease = lifecycle.capture();
    let active = true;
    let handled: string | undefined;
    const respond = (response: Notifications.NotificationResponse | null) => {
      if (!response || !active || !lease.current() || sessionScope(lease.session()) !== scope) return;
      const { identifier, content } = response.notification.request;
      if (identifier === handled) return;
      handled = identifier;
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (registration.confirmedScope && registration.confirmedScope !== scope) return;
      openNotification(content.data);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(respond);
    void Notifications.getLastNotificationResponseAsync().then(respond).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, [scope, ready]);
}
