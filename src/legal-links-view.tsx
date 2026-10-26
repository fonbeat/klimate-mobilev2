import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_POLICY_URL, PRODUCT_OWNER, SUPPORT_EMAIL, SUPPORT_URL } from './legal-links';
import { useV2Theme } from './theme';
import { spacing, typography } from './tokens';

export function LegalLinks() {
  const { colors } = useV2Theme();
  const [error, setError] = useState('');
  const open = async (url: string) => {
    setError('');
    try { await Linking.openURL(url); }
    catch { setError(url === SUPPORT_URL ? `Couldn’t open your email app. Contact ${SUPPORT_EMAIL}.` : `Couldn’t open the privacy policy. Visit ${PRIVACY_POLICY_URL}.`); }
  };
  return <View style={styles.container}>
    <View style={styles.links}>
      <Pressable accessibilityRole="link" accessibilityLabel="Privacy policy, opens in browser" onPress={() => void open(PRIVACY_POLICY_URL)} style={styles.link}><Text style={[typography.metadata, { color: colors.blue }]}>Privacy policy</Text></Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={`Contact support at ${SUPPORT_EMAIL}`} onPress={() => void open(SUPPORT_URL)} style={styles.link}><Text style={[typography.metadata, { color: colors.blue }]}>Contact support</Text></Pressable>
    </View>
    <Text style={[typography.metadata, { color: colors.muted, textAlign: 'center' }]}>Klimate Mobile · {PRODUCT_OWNER}</Text>
    {!!error && <Text selectable accessibilityLiveRegion="polite" style={[typography.metadata, { color: colors.muted }]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, paddingVertical: spacing.sm },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
});
