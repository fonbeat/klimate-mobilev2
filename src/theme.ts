import { useColorScheme } from 'react-native';
import { statusTone, type StatusDomain, type StatusTone } from './status';
import { darkColors, lightColors, type V2Colors } from './tokens';

// Kept as the dark palette alias while legacy screens migrate to useV2Theme.
export const colors = darkColors;

export function colorForTone(tone: StatusTone, palette: V2Colors = colors) {
  if (tone === 'positive') return palette.up;
  if (tone === 'critical') return palette.down;
  if (tone === 'warning') return palette.attention;
  if (tone === 'info') return palette.blue;
  return palette.unknown;
}

export function statusColor(status?: string, domain: StatusDomain = 'monitor', palette: V2Colors = colors) {
  return colorForTone(statusTone(status, domain), palette);
}

export function useV2Theme() {
  const scheme = useColorScheme();
  return { colors: scheme === 'light' ? lightColors : darkColors, scheme: scheme === 'light' ? 'light' as const : 'dark' as const };
}

export type { StatusDomain, StatusTone } from './status';
