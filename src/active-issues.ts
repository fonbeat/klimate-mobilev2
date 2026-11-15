import { ApiError } from './api.ts';
import { liveStatusPath, offlineGatewaysPath } from './live-status.ts';
import { readPageRange } from './read-page-range.ts';
import type { MonitorPage, ProbeView } from './types';

const pageSize = 100;
export const activeIssuesPath = offlineGatewaysPath(0, pageSize);
type Read = <T>(path: string) => Promise<T>;

async function readIssues<TPage extends { total: number }, TItem>(
  read: (offset: number, limit: number) => Promise<TPage>,
  items: (page: TPage) => TItem[],
  id: (item: TItem) => string,
) {
  let expectedTotal: number | undefined;
  const page = await readPageRange({
    offset: 0, pageSize, wanted: Infinity, read, items, total: (result) => result.total,
    current: () => true,
    onPage: (result) => {
      expectedTotal ??= result.total;
      if (expectedTotal !== result.total) throw new ApiError('Active issues changed during refresh. Try again.', 409);
    },
  });
  if (!page || page.records.length !== page.total || new Set(page.records.map(id)).size !== page.total) {
    throw new ApiError('Klimate returned an incomplete active issue list. Try again.', 502);
  }
  return page.records;
}

export async function readActiveIssues(path: string, read: Read) {
  const monitorIssues = (status: 'Down' | 'Attention') => readIssues(
    (offset, limit) => read<MonitorPage>(liveStatusPath('monitors', offset, limit, status, '')),
    (page) => page.records,
    (monitor) => monitor.monitorID || monitor.ID,
  );
  const [down, attention, offline] = await Promise.all([
    monitorIssues('Down'),
    monitorIssues('Attention'),
    readIssues((offset, limit) => read<ProbeView>(offset === 0 ? path : offlineGatewaysPath(offset, limit)), (page) => page.probes, (gateway) => gateway.id),
  ]);
  // A monitor can move between the two feeds during a refresh. Show it once.
  const downIds = new Set(down.map((monitor) => monitor.monitorID || monitor.ID));
  const attentionOnly = attention.filter((monitor) => !downIds.has(monitor.monitorID || monitor.ID));
  return { down, attention: attentionOnly, offline, count: down.length + attentionOnly.length + offline.length };
}
