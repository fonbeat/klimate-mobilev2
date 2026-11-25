import { ApiError } from './api.ts';
import { liveStatusPath, offlineGatewaysPath } from './live-status.ts';
import { readPageRange } from './read-page-range.ts';
import type { Monitor, MonitorPage, Probe, ProbeView } from './types';

const pageSize = 100;
export const activeIssuesPath = "/v3/status/activeIssues";
type Read = <T>(path: string) => Promise<T>;

class InconsistentIssueFeedError extends ApiError {
  constructor(message: string, status: number) { super(message, status); }
}

async function readIssues<TPage extends { total: number }, TItem>(
  read: (offset: number, limit: number) => Promise<TPage>,
  items: (page: TPage) => TItem[],
  id: (item: TItem) => string,
) {
  const readOnce = () => readIssuePages(read, items, id);
  try { return await readOnce(); }
  catch (error) {
    if (!(error instanceof InconsistentIssueFeedError)) throw error;
    return readOnce();
  }
}

async function readIssuePages<TPage extends { total: number }, TItem>(
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
      if (expectedTotal !== result.total) throw new InconsistentIssueFeedError('Active issues changed during refresh. Try again.', 409);
    },
  });
  if (!page || page.records.length !== page.total || new Set(page.records.map(id)).size !== page.total) {
    throw new InconsistentIssueFeedError('Klimate returned an incomplete active issue list. Try again.', 502);
  }
  return page.records;
}

async function readLegacyActiveIssues(read: Read) {
  const monitorIssues = (status: 'Down' | 'Attention') => readIssues(
    (offset, limit) => read<MonitorPage>(liveStatusPath('monitors', offset, limit, status, '')),
    (page) => page.records,
    (monitor) => monitor.monitorID || monitor.ID,
  );
  const [down, attention, offline] = await Promise.all([
    monitorIssues('Down'),
    monitorIssues('Attention'),
    readIssues((offset, limit) => read<ProbeView>(offlineGatewaysPath(offset, limit)), (page) => page.probes, (gateway) => gateway.id),
  ]);
  // A monitor can move between the two feeds during a refresh. Show it once.
  const downIds = new Set(down.map((monitor) => monitor.monitorID || monitor.ID));
  const attentionOnly = attention.filter((monitor) => !downIds.has(monitor.monitorID || monitor.ID));
  return { down, attention: attentionOnly, offline, count: down.length + attentionOnly.length + offline.length };
}

type ActiveIssuePage = {
  records: Array<{ monitor: Monitor } | { gateway: Probe }>;
  total: number;
  nextCursor?: string;
};

export async function readActiveIssues(path: string, read: Read) {
  try {
    return await readIssueSnapshot(path, read);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return readLegacyActiveIssues(read);
    if (error instanceof ApiError && error.code === 'ISSUES_SNAPSHOT_EXPIRED') return readIssueSnapshot(path, read);
    throw error;
  }
}

async function readIssueSnapshot(path: string, read: Read) {
  const first = await read<ActiveIssuePage>(path);
  const down: Monitor[] = [], attention: Monitor[] = [], offline: Probe[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  const incomplete = () => new InconsistentIssueFeedError('Klimate returned an incomplete active issue list. Try again.', 502);
  let page = first;
  for (;;) {
    if (page.total !== first.total || (page.nextCursor && !page.records.length)) throw incomplete();
    for (const issue of page.records) {
      const key = 'monitor' in issue ? 'monitor:' + (issue.monitor.monitorID || issue.monitor.ID) : 'gateway:' + issue.gateway.id;
      if (seen.has(key)) throw incomplete();
      seen.add(key);
      if ('gateway' in issue) offline.push(issue.gateway);
      else if (issue.monitor.status === 'Down') down.push(issue.monitor);
      else if (issue.monitor.status === 'Attention') attention.push(issue.monitor);
      else throw incomplete();
    }
    if (!page.nextCursor) break;
    if (cursors.has(page.nextCursor) || seen.size >= first.total) throw incomplete();
    cursors.add(page.nextCursor);
    page = await read<ActiveIssuePage>(path + '?cursor=' + encodeURIComponent(page.nextCursor));
  }
  if (seen.size !== first.total) throw incomplete();
  return { down, attention, offline, count: first.total };
}
