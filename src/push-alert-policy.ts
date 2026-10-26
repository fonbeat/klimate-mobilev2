import type { PushPreferences } from './types';

// The mobile client offers no opt-out by outage type. Preserve the backend contract.
export async function ensureOutagePushEnabled(
  read: () => Promise<PushPreferences>,
  save: (preferences: PushPreferences) => Promise<unknown>,
  current = () => true,
) {
  const preferences = await read();
  if (!current()) return false;
  if (!preferences.monitorDown || !preferences.probeOffline) {
    await save({ monitorDown: true, probeOffline: true });
  }
  return current();
}

export type PhonePermission = 'allowed' | 'quiet' | 'blocked' | 'notRequested' | 'unavailable';
export function phonePermissionLabel(status: PhonePermission) {
  return {
    allowed: 'Notifications allowed', quiet: 'Quiet notifications allowed',
    blocked: 'Notifications blocked', notRequested: 'Permission not yet requested',
    unavailable: 'Notifications unavailable on this device',
  }[status];
}
