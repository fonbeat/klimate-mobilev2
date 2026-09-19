export function notificationDestination(data: Record<string, unknown> = {}) {
  if (data.screen === 'probes' || data.type === 'probe_offline') {
    return { pathname: '/(tabs)/more' as const, params: { section: 'probes' } };
  }
  if (data.screen === 'incidents' || data.type === 'monitor_down' || data.incidentId || data.incidentID) {
    return '/(tabs)/incidents' as const;
  }
  return null;
}
