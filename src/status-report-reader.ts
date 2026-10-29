import { ApiError } from './api.ts';
import { monitorReportPath } from './report-routing.ts';
import { databaseFresh, type CloudReport, type DatabaseReport } from './new-monitor-reports.ts';

export type ReportRead = <T>(path: string) => Promise<T>;
export type LoadedStatusReport = { path: string; report: unknown };

/** Notifications and service dependencies can supply only a monitor ID.
 * Cloud IDs are not legacy monitor IDs; do not turn a 401/403 or outage into
 * an alternate-resource lookup. Only a real legacy 404 allows that fallback. */
export async function readStatusReport(requestPath: string, read: ReportRead): Promise<LoadedStatusReport> {
  const [path, query = ''] = requestPath.split('?');
  const legacy = path.match(/^\/v2\/monitors\/([^/]+)\/uptime$/);
  let report: unknown;
  try { report = await read(requestPath); }
  catch (error) {
    if (!legacy || !(error instanceof ApiError) || error.status !== 404) throw error;
    const destination = `/v3/cloudMonitors/${legacy[1]}/report`;
    try { return { path: destination, report: await read(`${destination}${query ? `?${query}` : ''}`) }; }
    catch (cloudError) { if (cloudError instanceof ApiError && cloudError.status === 404) throw error; throw cloudError; }
  }
  if (legacy) {
    const type = (report as { monitor?: { type?: string } })?.monitor?.type;
    if (type && ['CLOUD', 'DATABASE'].includes(type.toUpperCase())) {
      const destination = monitorReportPath({ type, monitorID: decodeURIComponent(legacy[1]) })!;
      return { path: destination, report: await read(`${destination}${query ? `?${query}` : ''}`) };
    }
  }
  return { path, report };
}

export function monitorRecoveryEvidence(loaded: LoadedStatusReport, now = Date.now()) {
  if (loaded.path.startsWith('/v3/cloudMonitors/')) {
    const r = loaded.report as CloudReport;
    return { healthy: r.collectionEnabled && r.monitor.enabled && r.summary.state.toLowerCase() === 'up' && r.summary.canResolveIncident === true && r.summary.failedLocations === 0 && r.summary.unknownLocations === 0, at: r.generatedAt };
  }
  if (loaded.path.startsWith('/v3/databaseMonitors/')) {
    const r = loaded.report as DatabaseReport;
    return { healthy: r.status.toLowerCase() === 'up' && databaseFresh(r, now) && r.scrapeState === 'healthy' && r.openIncidents === 0, at: r.source.lastSeen };
  }
  const r = loaded.report as { status?: string; generatedAt?: string };
  return { healthy: r.status?.toLowerCase() === 'up', at: r.generatedAt };
}
