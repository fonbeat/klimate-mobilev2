import type { Session } from './types';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown, keys: string[]) => object(value) && keys.every((key) => text(value[key]));

export function validSession(value: unknown): value is Session {
  if (!object(value) || !strings(value.user, ['ID', 'firstname', 'lastname', 'email', 'role'])) return false;
  if (!text(value.accessToken) || !value.accessToken.trim() || !text(value.refreshToken) || !value.refreshToken.trim()) return false;
  if (!object(value.user) || !value.user.ID || typeof value.user.isAdmin !== 'boolean' || typeof value.user.isOwner !== 'boolean') return false;
  if (value.tenantId !== undefined && !text(value.tenantId)) return false;
  return ['accessTokenExpiresAt', 'refreshTokenExpiresAt', 'sessionExpiresAt'].every((key) => value[key] === undefined || (text(value[key]) && Number.isFinite(Date.parse(value[key]))));
}

export function restorableSession(value: unknown, now = Date.now()): value is Session {
  return validSession(value) && [value.refreshTokenExpiresAt, value.sessionExpiresAt].every((expiry) => !expiry || Date.parse(expiry) > now);
}

type Shape = string | { [key: string]: Shape } | [Shape];
function matches(value: unknown, shape: Shape): boolean {
  if (typeof shape === 'string') {
    if (shape.endsWith('|null')) return value === null || matches(value, shape.slice(0, -5));
    return shape === 'count' ? count(value) : shape === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === shape;
  }
  if (Array.isArray(shape)) return Array.isArray(value) && value.every((entry) => matches(entry, shape[0]));
  return object(value) && Object.entries(shape).every(([key, child]) => matches(value[key], child));
}
const metric = { formatted: 'string' };
const monitorRow = { ID: 'string', label: 'string', type: 'string', status: 'string' } satisfies Shape;
const incidentRow = { id: 'string', status: 'string', label: 'string', type: 'string', startedAt: 'string' };

/** Validate fields consumed directly by screens. Additive server fields remain allowed. */
export function validResponse(path: string, value: unknown): boolean {
  const route = path.split('?')[0];
  if (route === '/v2/sessions/login') return validSession(value) || (object(value) && value.mfaRequired === true && text(value.mfaChallengeToken) && !!value.mfaChallengeToken);
  if (['/v2/sessions/refresh', '/v2/sessions/switch', '/v2/sessions/mfa/verify'].includes(route)) return validSession(value);
  if (!object(value) && !Array.isArray(value)) return false;
  let shape: Shape | undefined;
  if (route === '/v2/status/monitors') shape = { records: [monitorRow], total: 'count' };
  if (route === '/v2/status/targets') shape = { records: [{ ID: 'string', label: 'string', status: 'string', tags: ['string'] }], total: 'count' };
  if (route === '/v2/status/services') shape = { records: [{ ID: 'string', label: 'string', status: 'string', metric: { kind: 'string', caption: 'string', label: 'string' } }], total: 'count' };
  if (route === '/v2/notifications') shape = { records: [{ id: 'string', eventType: 'string', resourceType: 'string', resourceId: 'string', title: 'string', body: 'string', read: 'boolean', createdAt: 'string' }], total: 'count', unread: 'count' };
  if (route === '/v2/gateways') shape = { probes: [{ id: 'string', name: 'string', status: 'string', assignedWork: { targetCount: 'count', monitorCount: 'count' } }], total: 'count' };
  if (/^\/v2\/gateways\/[^/]+$/.test(route)) shape = { id: 'string', name: 'string', status: 'string', assignedWork: { targetCount: 'count', monitorCount: 'count' }, software: { installedVersion: 'string' } };
  if (route === '/v2/modules') shape = { modules: [{ key: 'string', enabled: 'boolean', available: 'boolean' }] };
  if (route === '/v2/sessions/organizations') shape = { organizations: [{ tenantId: 'string', name: 'string', role: 'string', isCurrent: 'boolean' }] };
  if (route === '/v2/incidents' || /^\/v2\/services\/[^/]+\/incidents$/.test(route)) shape = { incidents: [incidentRow], total: 'count' };
  if (/^\/v2\/targets\/[^/]+\/report$/.test(route)) shape = { target: { name: 'string', address: 'string' }, summary: { health: 'string', totalMonitors: 'count', up: 'count', down: 'count', attention: 'count' }, monitors: [{ id: 'string', name: 'string', type: 'string', status: 'string', reportPath: 'string' }] };
  if (/^\/v2\/services\/[^/]+\/report$/.test(route)) shape = { service: { name: 'string', health: 'string' }, definition: { indicators: [{}], dependencies: [{}], redundancyGroups: [{ members: [{}] }] }, current: { state: 'string', indicators: [{}], dependencies: [{}], redundancyGroups: [{ members: [{}] }] } };
  if (/^\/v2\/monitors\/[^/]+\/uptime$/.test(route)) shape = { monitor: { name: 'string', type: 'string', address: 'string' }, target: { id: 'string', name: 'string' }, status: 'string', summary: { availabilityPercent: 'number|null', averageResponseTimeMs: 'number|null', incidentCount: 'count' }, configuration: {} };
  if (/^\/v2\/monitors\/[^/]+\/path$/.test(route)) shape = { monitor: { name: 'string' }, target: {}, status: 'string', summary: { endToEndLatency: metric, packetLoss: metric, jitter: metric } };
  if (route.endsWith('/interface')) shape = { interface: { name: 'string', status: 'string', device: {}, probe: {}, adminStatus: {}, operationalStatus: {} }, inboundTraffic: {}, outboundTraffic: {}, utilization: metric, errors: metric, discards: metric };
  if (/^\/v2\/snmp\/endpoints\/[^/]+\/report$/.test(route)) shape = { device: { name: 'string', status: 'string', probe: {} }, availability: metric, responseTime: {}, monitors: [{ monitorID: 'string', name: 'string', status: 'string', type: 'string' }] };
  if (/^\/v2\/flow\/exporters\/[^/]+\/report$/.test(route)) shape = { exporter: { name: 'string', status: 'string', probe: {} }, summary: { totalFlows: metric, totalBytes: metric, averageFlowRate: metric, uniquePeers: metric }, topTalkers: [{}], topApplications: [{}] };
  if (/^\/v2\/syslog\/sources\/[^/]+\/report$/.test(route)) shape = { source: { name: 'string' }, collection: { status: 'string', probe: {} }, summary: { totalEvents: metric, criticalAndError: metric, activeFindings: {}, eventRate: {} }, findings: [{}] };
  if (route.endsWith('/host') || route.endsWith('/server')) shape = { host: { name: 'string' }, status: 'string', metrics: [{}], points: [{}] };
  if (/^\/v3\/monitors\/[^/]+\/winrm$/.test(route)) shape = { name: 'string', targetName: 'string', kind: 'string', resource: 'string', status: 'string', message: 'string', currentValue: 'number|null', lastCheckedAt: 'string|null' };
  return !shape || matches(value, shape);
}
