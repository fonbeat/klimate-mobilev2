export type CloudExecution = {
  id: string; locationId: string; scheduledAt: string; completedAt: string | null;
  state: string; reason?: string; statusCode?: number; totalMs: number;
  dnsMs?: number; connectMs?: number; tlsMs?: number; ttfbMs?: number; historical?: boolean;
};
export type CloudReport = {
  monitor: { id: string; name: string; enabled: boolean; config: { url: string; method: string; locationIds: string[] } };
  targetName: string; collectionEnabled: boolean; generatedAt: string;
  summary: { state: string; healthyLocations: number; failedLocations: number; unknownLocations: number; reportingLocations: number; meanResponseMs: number | null; medianResponseMs?: number | null; canResolveIncident?: boolean };
  locations: { id: string; name: string; available: boolean; state: string; latest: CloudExecution | null }[];
  mapLocations?: { id: string; name: string; country: string; readiness: string; lastContact: string | null }[];
  items: CloudExecution[]; total: number;
};
export type DatabaseReading = {
  key: string; name: string; unit: string; value: number; rate: number | null; cumulative: boolean;
  at: string; attributes: Record<string, string>;
};
export type DatabaseReport = {
  monitorId: string; targetId: string; targetName: string; gatewayName: string;
  source: { id: string; engine: string; endpoint: string; database: string; lastSeen: string };
  status: string; collectionState: string; scrapeState?: string; scrapeReason?: string;
  end: string; latest: DatabaseReading[]; openIncidents?: number;
  alert: { enabled: boolean; state: string; reason: string };
};

export const milliseconds = (value?: number | null) => value == null || !Number.isFinite(value) || value < 0 ? 'N/A' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms`;
export function cloudResponse(run: CloudExecution | null, currentState?: string) {
  if (!run?.completedAt || (currentState ?? run.state).toLowerCase() === 'unknown') return 'N/A';
  return milliseconds(run.totalMs);
}
export const databaseEngineLabel = (engine: string) => ({ postgresql: 'PostgreSQL', mysql: 'MySQL', oracle: 'Oracle', sqlserver: 'SQL Server', db2: 'IBM Db2' }[engine] ?? engine);
export function databaseFresh(report: Pick<DatabaseReport, 'collectionState' | 'source'>, now = Date.now()) {
  const at = Date.parse(report.source.lastSeen);
  return report.collectionState === 'fresh' && Number.isFinite(at) && at <= now + 60_000 && now - at <= 300_000;
}
export function databaseValue(metric: DatabaseReading) {
  const value = metric.cumulative ? metric.rate : metric.value;
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (!metric.cumulative && metric.unit === 'By') {
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
    return `${value.toLocaleString()} B`;
  }
  const unit = metric.unit === '1' ? 'count' : metric.unit.replace(/[{}]/g, '') || 'count';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${metric.cumulative ? ` ${unit}/s` : unit === 'count' ? '' : ` ${unit}`}`;
}
export function databaseMetricName(metric: DatabaseReading) {
  const name = metric.name.replace(/^(postgresql|mysql|oracledb|sqlserver)[._]|^db2_/, '').replace(/[._]/g, ' ');
  const scope = Object.entries(metric.attributes).map(([key, value]) => `${key}: ${value}`).join(' · ');
  return scope ? `${name} · ${scope}` : name;
}
