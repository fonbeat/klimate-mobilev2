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
const execution = { id: 'string', locationId: 'string', scheduledAt: 'string', completedAt: 'string|null', state: 'string', totalMs: 'number' };

function validCloud(value: unknown) {
  if (!matches(value, { monitor: { id: 'string', name: 'string', enabled: 'boolean', config: { url: 'string', method: 'string', locationIds: ['string'] } }, targetName: 'string', collectionEnabled: 'boolean', generatedAt: 'string', summary: { state: 'string', healthyLocations: 'count', failedLocations: 'count', unknownLocations: 'count', reportingLocations: 'count', meanResponseMs: 'number|null' }, locations: [{}], items: [execution], total: 'count' }) || !object(value)) return false;
  const config = (value.monitor as { config: { locationIds: string[] } }).config;
  const locations = value.locations as Record<string, unknown>[];
  if (!config.locationIds.length || config.locationIds.length > 20 || new Set(config.locationIds).size !== config.locationIds.length || locations.length !== config.locationIds.length || (value.items as unknown[]).length > 100 || !Number.isFinite(Date.parse(value.generatedAt as string))) return false;
  const ids = new Set<string>();
  if (!locations.every((location) => {
    if (!matches(location, { id: 'string', name: 'string', available: 'boolean', state: 'string' }) || !config.locationIds.includes(location.id as string) || ids.has(location.id as string)) return false;
    ids.add(location.id as string);
    return location.latest === null || matches(location.latest, execution);
  })) return false;
  const runs = [...value.items as Record<string, unknown>[], ...locations.map((location) => location.latest).filter(object)];
  if (!runs.every((run) => config.locationIds.includes(run.locationId as string) && Number.isFinite(Date.parse(run.scheduledAt as string)) && (run.completedAt === null || Number.isFinite(Date.parse(run.completedAt as string))) && ['dnsMs', 'connectMs', 'tlsMs', 'ttfbMs', 'statusCode'].every((key) => run[key] === undefined || (typeof run[key] === 'number' && Number.isFinite(run[key]) && run[key] >= 0)) && (run.reason === undefined || text(run.reason)) && (run.historical === undefined || typeof run.historical === 'boolean'))) return false;
  const summary = value.summary as Record<string, unknown>;
  if (summary.medianResponseMs !== undefined && !matches(summary.medianResponseMs, 'number|null')) return false;
  if (summary.canResolveIncident !== undefined && typeof summary.canResolveIncident !== 'boolean') return false;
  return value.mapLocations === undefined || (matches(value.mapLocations, [{ id: 'string', name: 'string', country: 'string', readiness: 'string', lastContact: 'string|null' }]) && (value.mapLocations as Record<string, unknown>[]).length <= 20 && (value.mapLocations as Record<string, unknown>[]).every((location) => config.locationIds.includes(location.id as string)));
}

function validDatabase(value: unknown) {
  if (!matches(value, { monitorId: 'string', targetId: 'string', targetName: 'string', gatewayName: 'string', source: { id: 'string', engine: 'string', endpoint: 'string', database: 'string', lastSeen: 'string' }, status: 'string', collectionState: 'string', end: 'string', latest: [{ key: 'string', name: 'string', unit: 'string', value: 'number', rate: 'number|null', cumulative: 'boolean', at: 'string', attributes: {} }], alert: { enabled: 'boolean', state: 'string', reason: 'string' } }) || !object(value)) return false;
  if ((value.latest as unknown[]).length > 256 || !Number.isFinite(Date.parse(value.end as string)) || !Number.isFinite(Date.parse((value.source as Record<string, unknown>).lastSeen as string))) return false;
  if (value.openIncidents !== undefined && !count(value.openIncidents)) return false;
  if (!['scrapeState', 'scrapeReason'].every((key) => value[key] === undefined || text(value[key]))) return false;
  return (value.latest as Record<string, unknown>[]).every((metric) => Number.isFinite(Date.parse(metric.at as string)) && Object.keys(metric.attributes as object).length <= 10 && Object.values(metric.attributes as object).every(text));
}

/** Validate fields consumed directly by screens. Additive server fields remain allowed. */
export function validResponse(path: string, value: unknown): boolean {
  const route = path.split('?')[0];
  if (route === '/v2/sessions/login') return validSession(value) || (object(value) && value.mfaRequired === true && text(value.mfaChallengeToken) && !!value.mfaChallengeToken);
  if (['/v2/sessions/refresh', '/v2/sessions/switch', '/v2/sessions/mfa/verify'].includes(route)) return validSession(value);
  if (!object(value) && !Array.isArray(value)) return false;
  if (/^\/v3\/cloudMonitors\/[^/]+\/report$/.test(route)) return validCloud(value);
  if (/^\/v3\/databaseMonitors\/[^/]+\/report$/.test(route)) return validDatabase(value);
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
