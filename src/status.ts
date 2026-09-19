export type StatusDomain = 'monitor' | 'incident' | 'maintenance' | 'probe' | 'attention';
export type StatusTone = 'positive' | 'critical' | 'warning' | 'info' | 'neutral';

const normalized = (status?: string) => status?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';

export function statusTone(status?: string, domain: StatusDomain = 'monitor'): StatusTone {
  const value = normalized(status);

  if (domain === 'incident') {
    if (['resolved', 'completed', 'closed'].includes(value)) return 'positive';
    if (['acknowledged', 'investigating'].includes(value)) return 'warning';
    if (['pending', 'active', 'open', 'down', 'critical'].includes(value)) return 'critical';
    return 'neutral';
  }

  if (domain === 'maintenance') {
    if (['active', 'in_progress'].includes(value)) return 'info';
    if (['upcoming', 'scheduled', 'pending'].includes(value)) return 'warning';
    if (['completed', 'ended'].includes(value)) return 'positive';
    return 'neutral';
  }

  if (domain === 'attention') {
    if (['critical', 'error', 'down'].includes(value)) return 'critical';
    if (['warning', 'attention', 'affected'].includes(value)) return 'warning';
    if (['info', 'informational'].includes(value)) return 'info';
    return 'neutral';
  }

  if (['up', 'online', 'healthy', 'resolved', 'completed'].includes(value)) return 'positive';
  if (['down', 'offline', 'failed', 'critical'].includes(value)) return 'critical';
  if (['attention', 'warning', 'degraded', 'affected', 'pending'].includes(value)) return 'warning';
  return 'neutral';
}

export type OverviewHealth = {
  kind: 'no-data' | 'healthy' | 'affected';
  percentage: number | null;
  label: string;
};

export function getOverviewHealth(summary?: { totalMonitors: number; upMonitors: number; downMonitors: number; attentionMonitors: number }): OverviewHealth {
  if (!summary?.totalMonitors) return { kind: 'no-data', percentage: null, label: 'No monitoring data' };
  const percentage = Math.round((summary.upMonitors / summary.totalMonitors) * 100);
  const affected = summary.downMonitors > 0 || summary.attentionMonitors > 0;
  return { kind: affected ? 'affected' : 'healthy', percentage, label: `${percentage}% operational` };
}
