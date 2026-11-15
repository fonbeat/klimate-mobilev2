import { ApiError } from './api.ts';
import { liveStatusPath, monitorCard, statusCounts, type LiveStatusCard } from './live-status.ts';
import type { HealthCounts } from './overview-presentation.ts';
import { validResponse } from './response-validation.ts';
import type { Monitor, MonitorPage } from './types';

const previewSize = 3;
export const overviewPath = `/v3/operations/resources?perspective=monitors&status=problems&sort=problems&wallboard=true&compactCards=true&limit=${previewSize}`;
type OverviewSnapshot = { counts: HealthCounts; issues: LiveStatusCard[]; lastUpdated: string };
type Read = <T>(path: string) => Promise<T>;
type OperationsPreview = {
  lastUpdated: string;
  summary: { total: number; Up: number; Down: number; Attention: number; Unknown: number };
  records: { wallboard: Monitor }[];
};

function overviewSnapshot(value: OperationsPreview | null): OverviewSnapshot | undefined {
  const summary = value?.summary;
  if (!summary || !Array.isArray(value.records) || !Number.isFinite(Date.parse(value.lastUpdated))) return;
  const { total, Up: healthy, Down: down, Attention: attention, Unknown: unknown } = summary;
  if (![total, healthy, down, attention, unknown].every((count) => Number.isSafeInteger(count) && count >= 0) || total !== healthy + down + attention + unknown) return;
  const records = value.records.map((row) => row?.wallboard);
  if (!validResponse('/v2/status/monitors', { records, total }) || records.length !== Math.min(previewSize, down + attention) || records.some(({ status }) => status !== 'Down' && status !== 'Attention')) return;
  return { counts: { total, healthy, down, attention, unknown }, issues: records.map(monitorCard), lastUpdated: value.lastUpdated };
}

export async function readOverview(path: string, read: Read): Promise<OverviewSnapshot> {
  try {
    const snapshot = overviewSnapshot(await read<OperationsPreview>(path));
    if (snapshot) return snapshot;
  } catch (error) {
    if (!(error instanceof ApiError) || !([404, 405].includes(error.status) || error.code === 'INVALID_RESPONSE')) throw error;
  }

  // Older deployments still serve the V2 monitor feed with aggregate counts.
  const down = await read<MonitorPage>(liveStatusPath('monitors', 0, previewSize, 'down', ''));
  if (!down.summary) throw new ApiError('Monitor health is temporarily unavailable.', 502, 'INVALID_RESPONSE');
  const counts = statusCounts('monitors', down);
  const room = previewSize - down.records.length;
  const attention = room > 0 && counts.attention > 0 ? await read<MonitorPage>(liveStatusPath('monitors', 0, room, 'attention', '')) : undefined;
  return { counts, issues: [...down.records, ...(attention?.records ?? [])].slice(0, previewSize).map(monitorCard), lastUpdated: down.summary.lastUpdated };
}
