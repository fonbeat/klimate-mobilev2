import type { StatusView } from './status-view';

export type HealthCounts = { total: number; healthy: number; down: number; attention: number; unknown: number };

export function overviewSectionTitle(counts: HealthCounts) {
  return counts.down || counts.attention ? 'Needs attention' : counts.unknown ? 'Status unknown' : counts.total ? 'All clear' : 'Awaiting first checks';
}

export function overviewIssueFilter(counts: HealthCounts): 'Down' | 'Attention' | undefined {
  return counts.down > 0 ? 'Down' : counts.attention > 0 ? 'Attention' : undefined;
}

export function attentionName(view: StatusView) {
  return view === 'monitors' ? 'attention' : view === 'targets' ? 'affected' : 'degraded';
}

export function overviewPortrait(view: StatusView, counts: HealthCounts) {
  const noun = (count: number) => count === 1 ? view.slice(0, -1) : view;
  const detail = `${counts.healthy} of ${counts.total} ${view} healthy`;

  if (counts.down > 0) return { headline: `${counts.down} ${noun(counts.down)} down`, detail, tone: 'down' as const };
  if (counts.attention > 0) {
    const headline = view === 'monitors'
      ? `${counts.attention} ${noun(counts.attention)} need attention`
      : `${counts.attention} ${noun(counts.attention)} ${attentionName(view)}`;
    return { headline, detail, tone: 'attention' as const };
  }
  if (counts.unknown > 0) return { headline: 'Status unknown', detail: `${counts.unknown} ${noun(counts.unknown)} without recent health data`, tone: 'unknown' as const };
  if (counts.total > 0) return { headline: 'All clear', detail: `All ${counts.total} ${view} healthy`, tone: 'up' as const };
  return { headline: 'Awaiting first checks', detail: `No ${view} are reporting yet`, tone: 'unknown' as const };
}
