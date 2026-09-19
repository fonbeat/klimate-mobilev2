export const spacing = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 22, round: 999 } as const;
export const controlHeights = { compact: 40, standard: 48, prominent: 52, touchTarget: 44 } as const;
export const typography = {
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '700' as const, letterSpacing: 1.2 },
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.8 },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  metadata: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
  metric: { fontSize: 24, lineHeight: 29, fontWeight: '700' as const },
} as const;
export const layout = { phoneGutter: 16, tabletGutter: 24, contentMaxWidth: 1120, listGap: 12, tabletBreakpoint: 768 } as const;

export const lightColors = {
  deep: '#0D2744', ink: '#263143', navy: '#174A86', blue: '#2563A9', cyan: '#2F7EAA',
  canvas: '#F5F7FA', card: '#FFFFFF', cardRaised: '#EEF3F8', line: '#D9E1EA', muted: '#66758B',
  up: '#2FA86F', down: '#EF334C', attention: '#E89628', unknown: '#8B9AAF', onStatus: '#FFFFFF',
} as const;

export const darkColors = {
  deep: '#071A2D', ink: '#F4F8FB', navy: '#4B91D1', blue: '#65A8DE', cyan: '#63B4D1',
  canvas: '#0B1722', card: '#152532', cardRaised: '#1A2D3C', line: '#2A3D4C', muted: '#9CAEBB',
  up: '#45C58A', down: '#F05B67', attention: '#F2A84B', unknown: '#8295A4', onStatus: '#071A2D',
} as const;

export type V2Colors = typeof darkColors | typeof lightColors;
