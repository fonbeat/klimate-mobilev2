import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text,
  TextInput, View, ViewStyle, useWindowDimensions,
} from 'react-native';
import { colorForTone, statusColor, useV2Theme, type StatusDomain, type StatusTone } from './theme';
import { controlHeights, layout, radii, spacing, typography } from './tokens';
import { resolveScreenState } from './screen-state';
import { displayMetric } from './metric-display';

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const tablet = width >= layout.tabletBreakpoint;
  return { tablet, gutter: tablet ? layout.tabletGutter : layout.phoneGutter, columns: tablet ? 2 : 1 };
}

export function Page({ children, refreshing = false, onRefresh }: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>) {
  const theme = useV2Theme();
  const responsive = useResponsiveLayout();
  return <ScrollView
    style={{ flex: 1, backgroundColor: theme.colors.canvas }}
    contentContainerStyle={[styles.pageContent, { paddingHorizontal: responsive.gutter }]}
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.navy} /> : undefined}
  >{children}</ScrollView>;
}

export function PageTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  const { colors } = useV2Theme();
  return <View style={styles.heading} accessibilityRole="header">
    {!!eyebrow && <Text style={[styles.eyebrow, { color: colors.blue }]}>{eyebrow}</Text>}
    <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
    <Text style={[styles.detail, { color: colors.muted }]}>{detail}</Text>
  </View>;
}

export function Card({ children, style, accessibilityLabel }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; accessibilityLabel?: string }>) {
  const { colors } = useV2Theme();
  return <View accessibilityLabel={accessibilityLabel} style={[styles.card, { backgroundColor: colors.card }, style]}>{children}</View>;
}

export function RefreshWarning({ error }: { error: string | null }) {
  const { colors } = useV2Theme();
  if (!error) return null;
  return <Card><Text accessibilityLiveRegion="polite" style={[typography.metadata, { color: colors.attention }]}>Couldn’t refresh. Showing the last available data. {error}</Text></Card>;
}

export function Button({ label, onPress, icon, busy = false, disabled = false, variant = 'primary' }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger' }) {
  const { colors } = useV2Theme();
  const foreground = variant === 'primary' ? colors.onStatus : variant === 'danger' ? colors.down : colors.blue;
  const background = variant === 'primary' ? colors.navy : 'transparent';
  const borderColor = variant === 'danger' ? colors.down : variant === 'secondary' ? colors.line : colors.navy;
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ busy, disabled: disabled || busy }}
    disabled={disabled || busy}
    onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: background, borderColor }, pressed && styles.pressed, (disabled || busy) && styles.disabled]}
  >{busy ? <ActivityIndicator color={foreground} /> : <>{icon && <Ionicons name={icon} size={18} color={foreground} importantForAccessibility="no" />}<Text style={[styles.buttonText, { color: foreground }]}>{label}</Text></>}</Pressable>;
}

export function IconButton({ icon, label, onPress, selected = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; selected?: boolean }) {
  const { colors } = useV2Theme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: selected ? colors.cardRaised : colors.card, borderColor: colors.line }, pressed && styles.pressed]}><Ionicons name={icon} size={20} color={colors.muted} /></Pressable>;
}

export function StatusIndicator({ status, domain = 'monitor', label, size = 12 }: { status: string; domain?: StatusDomain; label?: string; size?: number }) {
  const { colors } = useV2Theme();
  const color = statusColor(status, domain, colors);
  return <View
    accessible
    accessibilityLabel={label ?? `Status: ${status || 'Unknown'}`}
    style={[styles.statusIndicator, { width: size, height: size, borderRadius: size, backgroundColor: color }]}
  />;
}

export function StatusPill({ status, domain = 'monitor' }: { status: string; domain?: StatusDomain }) {
  const { colors } = useV2Theme();
  const color = statusColor(status, domain, colors);
  return <View accessibilityLabel={`Status: ${status || 'Unknown'}`} style={[styles.pill, { backgroundColor: colors.cardRaised }]}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={[styles.pillText, { color: colors.ink }]}>{status || 'Unknown'}</Text>
  </View>;
}

export type SummaryMetric = { label: string; value: string | number; tone?: StatusTone };
export function SummaryStrip({ items }: { items: SummaryMetric[] }) {
  const { colors } = useV2Theme();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.2 || (items.length > 3 && width < 430) ? 2 : items.length;
  return <View style={[styles.summaryStrip, { backgroundColor: colors.card }]}>
    {items.map((item, index) => <View key={item.label} accessible accessibilityLabel={`${item.label}: ${displayMetric(item.value)}`} style={[styles.summaryMetric, { width: columns === 1 ? '100%' : columns === 2 ? index === items.length - 1 && items.length % 2 === 1 ? '100%' : '50%' : columns === 3 ? '33.3333%' : '25%' }, index % columns > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }, index >= columns && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <View style={styles.summaryLabelRow}>{item.tone && <View style={[styles.summaryDot, { backgroundColor: colorForTone(item.tone, colors) }]} />}<Text style={[styles.summaryLabel, { color: colors.muted }]}>{item.label}</Text></View>
      <Text style={[styles.summaryValue, { color: colors.ink }]}>{displayMetric(item.value)}</Text>
    </View>)}
  </View>;
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const { colors } = useV2Theme();
  return <View style={[styles.search, { backgroundColor: colors.card }]}>
    <Ionicons name="search" size={18} color={colors.muted} importantForAccessibility="no" />
    <TextInput
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      returnKeyType="search"
      style={[styles.searchInput, { color: colors.ink }]}
    />
  </View>;
}

export function FilterBar({ options, value, onChange, label = 'Filter', counts }: { options: string[]; value: string; onChange: (value: string) => void; label?: string; counts?: Record<string, number> }) {
  const { colors } = useV2Theme();
  return <View accessibilityLabel={label} accessibilityRole="tablist" style={styles.filters}>
    {options.map((option) => {
      const selected = value === option;
      return <Pressable
        key={option}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={counts?.[option] == null ? option : `${option}, ${counts[option]} ${counts[option] === 1 ? 'item' : 'items'}`}
        onPress={() => onChange(option)}
        style={({ pressed }) => [styles.filter, { backgroundColor: selected ? colors.selection : colors.card }, pressed && styles.pressed]}
      ><Text style={[styles.filterText, { color: selected ? colors.blue : colors.muted }]}>{option}</Text>{(counts?.[option] ?? 0) > 0 && <View style={[styles.filterCount, { backgroundColor: selected ? colors.card : colors.cardRaised }]}><Text style={[styles.filterCountText, { color: selected ? colors.blue : colors.muted }]}>{counts?.[option]}</Text></View>}</Pressable>;
    })}
  </View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { colors } = useV2Theme();
  return <View style={styles.sectionHeading}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>{children}</Text>{action}</View>;
}

export function State({ loading, error, empty, onRetry, compact = false, loadingMessage = 'Loading…' }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void; compact?: boolean; loadingMessage?: string }) {
  const { colors } = useV2Theme();
  const state = resolveScreenState({ loading, error, empty });
  if (state === 'loading') return <View style={[styles.state, compact && styles.stateCompact]} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.navy} /><Text style={[styles.stateText, { color: colors.muted }]}>{loadingMessage}</Text></View>;
  if (state === 'error') return <View style={[styles.state, compact && styles.stateCompact]} accessibilityLiveRegion="assertive"><Ionicons name="cloud-offline-outline" size={28} color={colors.down} /><Text style={[styles.stateTitle, { color: colors.ink }]}>Couldn’t refresh Klimate</Text><Text style={[styles.stateText, { color: colors.muted }]}>{error}</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.retry, { borderColor: colors.line }]}><Text style={[styles.retryText, { color: colors.blue }]}>Try again</Text></Pressable>}</View>;
  if (state === 'empty') return <View style={[styles.state, compact && styles.stateCompact]}><Ionicons name="checkmark-circle-outline" size={30} color={colors.up} /><Text style={[styles.stateTitle, { color: colors.ink }]}>{empty}</Text></View>;
  return null;
}

export function ListFooter({ loading, hasMore }: { loading: boolean; hasMore: boolean }) {
  const { colors } = useV2Theme();
  if (!loading && hasMore) return null;
  return <View style={styles.listFooter}>{loading ? <ActivityIndicator color={colors.navy} /> : <Text style={[styles.stateText, { color: colors.muted }]}>All items loaded</Text>}</View>;
}

export const shared = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: typography.cardTitle.fontSize, lineHeight: typography.cardTitle.lineHeight, fontWeight: typography.cardTitle.fontWeight },
  muted: { fontSize: typography.metadata.fontSize, lineHeight: typography.metadata.lineHeight },
  sectionTitle: { fontSize: typography.sectionTitle.fontSize, lineHeight: typography.sectionTitle.lineHeight, fontWeight: typography.sectionTitle.fontWeight, marginBottom: spacing.md, marginTop: spacing.sm },
});

const styles = StyleSheet.create({
  pageContent: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: spacing.md, paddingBottom: 42, gap: spacing.lg },
  heading: { paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.xs },
  eyebrow: typography.eyebrow,
  title: typography.pageTitle,
  detail: typography.body,
  card: { borderRadius: radii.md, padding: spacing.lg },
  button: { minHeight: controlHeights.standard, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  buttonText: { ...typography.body, fontWeight: '600' },
  iconButton: { width: controlHeights.standard, height: controlHeights.standard, borderWidth: 1, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .55 },
  statusIndicator: { flexShrink: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 10, minHeight: 32, borderRadius: radii.round, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  pillText: { ...typography.metadata, fontWeight: '700', textTransform: 'capitalize' },
  summaryStrip: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radii.md, overflow: 'hidden' },
  summaryMetric: { minHeight: 76, alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  summaryDot: { width: 7, height: 7, borderRadius: 4 },
  summaryLabel: { ...typography.metadata, fontSize: 11, flexShrink: 1 },
  summaryValue: { ...typography.metric, fontSize: 21 },
  search: { minHeight: controlHeights.standard, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md },
  searchInput: { flex: 1, minHeight: controlHeights.touchTarget, ...typography.body, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filter: { minHeight: controlHeights.compact, minWidth: controlHeights.touchTarget, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.md },
  filterText: { ...typography.metadata, fontWeight: '600' },
  filterCount: { minWidth: 20, minHeight: 20, paddingHorizontal: 5, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center' },
  filterCountText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  pressed: { opacity: .72 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionTitle: typography.sectionTitle,
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
  stateCompact: { minHeight: 130 },
  stateTitle: { ...typography.cardTitle, textAlign: 'center' },
  stateText: { ...typography.metadata, textAlign: 'center' },
  retry: { minHeight: controlHeights.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.xs, borderWidth: 1, borderRadius: radii.md },
  retryText: { ...typography.metadata, fontWeight: '700' },
  listFooter: { minHeight: 70, alignItems: 'center', justifyContent: 'center' },
});
