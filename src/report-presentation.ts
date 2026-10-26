import { monitorMeasurement, readableDuration } from './monitor-display.ts';
import type { AvailabilityCoverage } from './types';
import { displayMetric } from './metric-display.ts';

export function coverageMessage(coverage?: AvailabilityCoverage) {
  if (!coverage || coverage.unknownSeconds <= 0) return undefined;
  const missing = coverage.unknownSeconds < 60 ? `${Math.floor(coverage.unknownSeconds)}s` : readableDuration(coverage.unknownSeconds);
  return `Partial monitoring data · ${coverage.percent.toFixed(1)}% coverage. ${missing} without confirmed observations.`;
}

export function collectionLabel(value: string) {
  return ({ paused: 'Paused', maintenance: 'In maintenance', awaiting_fresh_result: 'Awaiting fresh result' } as Record<string, string>)[value] ?? 'Collection status unavailable';
}

export function snmpHealthValue(monitor: { currentValue: string; currentMetric?: { key: string; value?: number | null; unit?: string } | null }) {
  const metric = monitor.currentMetric;
  if (metric?.value != null && (/uptime|duration|timetick/i.test(metric.key) || /^(?:cs|centiseconds?|ticks?|timeticks?)$/i.test(metric.unit ?? ''))) {
    return monitorMeasurement({ type: 'SNMP', snmp: { healthMetric: { key: metric.key, value: metric.value, unit: metric.unit } } });
  }
  return displayMetric(monitor.currentValue);
}

type HostMetric = { name: string; value: number; at: string; attributes: Record<string, string> };
// Current utilization comes from latest metric observations, independently of the chart window.
export function serverUsage(metrics: HostMetric[], now = Date.now()) {
  const fresh = (metric: HostMetric) => {
    const age = now - Date.parse(metric.at);
    return Number.isFinite(age) && age >= -120_000 && age <= 300_000 && Number.isFinite(metric.value) && metric.value >= 0 && metric.value <= 1;
  };
  const idle = metrics.filter((m) => m.name === 'system.cpu.utilization' && m.attributes.state === 'idle');
  const used = metrics.filter((m) => m.name === 'system.memory.utilization' && m.attributes.state === 'used');
  const disks = metrics.filter((m) => m.name === 'system.filesystem.utilization');
  return {
    cpu: idle.length && idle.every(fresh) ? (1 - idle.reduce((sum, m) => sum + m.value, 0) / idle.length) * 100 : null,
    memory: used.length && used.every(fresh) ? used[0].value * 100 : null,
    filesystem: disks.length && disks.every(fresh) ? Math.max(...disks.map((m) => m.value)) * 100 : null,
  };
}
