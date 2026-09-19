type MonitorDisplayInput = {
  type: string;
  monitorLabel?: string;
  displayName?: string;
  host?: string;
  rtt?: string;
  lastChecked?: string;
  liveMetric?: { kind?: string; label?: string; value: number | null; unit?: string };
  path?: { hopCount?: number | null; latencyMs?: number | null };
  snmp?: { healthMetric?: { key?: string; label?: string; value: number | null; unit?: string } | null };
  flow?: { throughputBps?: number | null; flowsPerSecond?: number | null };
};

const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value);
const metric = (value: number | null | undefined, unit?: string) => value == null ? null : `${number(value)}${unit ? ` ${unit}` : ''}`;
const bitsPerSecond = (value: number) => {
  if (value >= 1_000_000_000) return `${number(value / 1_000_000_000)} Gbps`;
  if (value >= 1_000_000) return `${number(value / 1_000_000)} Mbps`;
  if (value >= 1_000) return `${number(value / 1_000)} Kbps`;
  return `${number(value)} bps`;
};
const readableDuration = (secondsValue: number) => {
  const seconds = Math.max(0, Math.floor(secondsValue));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};
const durationMetric = (value: number | null | undefined, unit?: string, hint?: string) => {
  if (value == null || !unit) return null;
  const normalized = unit.trim().toLowerCase();
  const durationHint = /uptime|duration/.test(hint?.toLowerCase() ?? '');
  let seconds: number | null = null;
  if (['centisecond', 'centiseconds', 'cs', 'tick', 'ticks', 'timetick', 'timeticks'].includes(normalized)) seconds = value / 100;
  else if (['second', 'seconds', 'sec', 'secs', 's'].includes(normalized)) seconds = value;
  else if (['minute', 'minutes', 'min', 'mins'].includes(normalized)) seconds = value * 60;
  else if (['hour', 'hours', 'hr', 'hrs', 'h'].includes(normalized)) seconds = value * 3_600;
  else if (['day', 'days', 'd'].includes(normalized)) seconds = value * 86_400;
  else if (durationHint && ['millisecond', 'milliseconds', 'ms'].includes(normalized)) seconds = value / 1_000;
  return seconds == null ? null : readableDuration(seconds);
};

export function monitorProtocolLabel(monitor: MonitorDisplayInput) {
  const type = monitor.type.trim().toUpperCase();
  if (type === 'FLOW') return 'FLOW';
  if (type === 'SNMP') {
    const metricLabel = monitor.displayName || monitor.monitorLabel || monitor.snmp?.healthMetric?.label;
    return metricLabel ? `SNMP · ${metricLabel}` : 'SNMP';
  }
  if (type === 'TCP') {
    const port = monitor.monitorLabel?.match(/\d+/)?.[0] ?? monitor.host?.match(/:(\d+)$/)?.[1];
    return port ? `TCP · ${port}` : 'TCP';
  }
  return type;
}

export function monitorMeasurement(monitor: MonitorDisplayInput) {
  const type = monitor.type.trim().toUpperCase();
  if (type === 'SNMP') {
    const live = monitor.liveMetric;
    if (live?.value != null && (live.kind === 'interface_throughput' || live.unit?.toLowerCase() === 'bps')) {
      return bitsPerSecond(live.value);
    }
    const health = monitor.snmp?.healthMetric;
    const healthDuration = durationMetric(health?.value, health?.unit, `${health?.key ?? ''} ${health?.label ?? ''}`);
    if (healthDuration) return healthDuration;
    const liveDuration = durationMetric(live?.value, live?.unit, `${live?.kind ?? ''} ${live?.label ?? ''}`);
    if (liveDuration) return liveDuration;
    return metric(health?.value, health?.unit) ?? metric(monitor.liveMetric?.value, monitor.liveMetric?.unit) ?? 'No data';
  }
  if (type === 'FLOW') {
    const throughput = monitor.flow?.throughputBps;
    if (throughput != null) return `${number(throughput / 1_000_000)} Mbps`;
    return metric(monitor.flow?.flowsPerSecond, 'flows/s') ?? 'No data';
  }
  if (type === 'PATH' && monitor.path?.hopCount != null) {
    const latency = monitor.path.latencyMs == null ? '' : ` · ${number(monitor.path.latencyMs)} ms`;
    return `${monitor.path.hopCount} hops${latency}`;
  }
  return monitor.rtt || monitor.lastChecked || 'No data';
}
