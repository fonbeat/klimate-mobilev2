export const spacing = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 18, xl: 24, round: 999 } as const;
export const controlHeights = { compact: 48, standard: 48, prominent: 52, touchTarget: 48 } as const;
export const typography = {
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.1 },
  pageTitle: { fontSize: 29, lineHeight: 35, fontWeight: '700' as const, letterSpacing: -0.8 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700' as const, letterSpacing: -0.25 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600' as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  metadata: { fontSize: 12, lineHeight: 17, fontWeight: '400' as const },
  metric: { fontSize: 23, lineHeight: 28, fontWeight: '700' as const },
} as const;
export const layout = { phoneGutter: 20, tabletGutter: 28, contentMaxWidth: 1120, listGap: 8, tabletBreakpoint: 768 } as const;

export const lightColors = {
  deep: '#171717', ink: '#202020', navy: '#292929', blue: '#393939', cyan: '#555555',
  canvas: '#F6F6F4', card: '#FFFFFF', cardRaised: '#F0F0EE', line: '#E3E3E0', muted: '#686868', selection: '#EAEAE7',
  up: '#188362', down: '#C6464B', attention: '#A86A1D', unknown: '#929292', onStatus: '#FFFFFF',
} as const;

export const darkColors = {
  deep: '#080808', ink: '#F4F4F4', navy: '#E7E7E7', blue: '#D6D6D6', cyan: '#C8C8C8',
  canvas: '#0B0B0B', card: '#191919', cardRaised: '#272727', line: '#353535', muted: '#A8A8A8', selection: '#303030',
  up: '#70D4A8', down: '#F18182', attention: '#E8B66B', unknown: '#989898', onStatus: '#101010',
} as const;

export type V2Colors = typeof darkColors | typeof lightColors;
