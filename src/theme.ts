export const colors = {
  deep: '#071A2D',
  ink: '#F4F8FB',
  navy: '#157A9B',
  blue: '#49C6D4',
  cyan: '#49C6D4',
  canvas: '#0B1722',
  card: '#152532',
  cardRaised: '#1A2D3C',
  line: '#2A3D4C',
  muted: '#9CAEBB',
  up: '#35D77F',
  down: '#F05B67',
  attention: '#F2A84B',
  unknown: '#8295A4',
} as const;

export function statusColor(status?: string) {
  switch (status?.toLowerCase()) {
    case 'up':
    case 'online':
    case 'resolved':
    case 'completed':
      return colors.up;
    case 'down':
    case 'offline':
    case 'pending':
    case 'active':
      return colors.down;
    case 'attention':
    case 'upcoming':
    case 'warning':
      return colors.attention;
    default:
      return colors.unknown;
  }
}
