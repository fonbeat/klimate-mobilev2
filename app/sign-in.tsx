import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, messageOf } from '@/api';
import { BrandLogo } from '@/brand-logo';
import { LegalLinks } from '@/legal-links-view';
import { useSession } from '@/session';
import { useV2Theme } from '@/theme';

export default function SignIn() {
  const { colors } = useV2Theme();
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true); setError('');
    try {
      const response = await login(email, password);
      if (response.mfaRequired) router.push('/verify');
    } catch (err) { setError(err instanceof ApiError && err.code === 'SSO_REQUIRED' ? 'This organization requires single sign-on, which Klimate Mobile does not yet support. Contact your organization administrator or use the web app.' : messageOf(err)); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><BrandLogo width={170} /></View>
        <View style={styles.copy}><Text style={[styles.eyebrow, { color: colors.cyan }]}>YOUR ENVIRONMENT, WITH YOU</Text><Text style={[styles.title, { color: colors.ink }]}>Know what’s happening. Wherever you are.</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Secure access to your enterprise monitoring from anywhere.</Text></View>
        <View style={[styles.form, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.ink }]}>Work email</Text>
          <TextInput accessibilityLabel="Work email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@company.com" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.line, backgroundColor: colors.cardRaised, color: colors.ink }]} />
          <Text style={[styles.label, { color: colors.ink }]}>Password</Text>
          <TextInput accessibilityLabel="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.line, backgroundColor: colors.cardRaised, color: colors.ink }]} onSubmitEditing={submit} />
          {!!error && <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.down }]}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} onPress={submit} disabled={busy} style={({ pressed }) => [styles.button, { backgroundColor: colors.navy }, pressed && { opacity: .86 }, busy && { opacity: .7 }]}>{busy ? <ActivityIndicator color={colors.onStatus} /> : <Text style={[styles.buttonText, { color: colors.onStatus }]}>Continue securely</Text>}</Pressable>
        </View>
        <LegalLinks />
      </ScrollView></KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, keyboard: { flex: 1 }, screen: { flexGrow: 1, padding: 26, justifyContent: 'space-between' },
  brand: { paddingTop: 8 },
  copy: { gap: 12, marginTop: 46, marginBottom: 28 }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, title: { fontSize: 39, lineHeight: 43, letterSpacing: -1.5, fontWeight: '800' }, subtitle: { fontSize: 15, lineHeight: 22, maxWidth: 330 },
  form: { padding: 20, borderRadius: 22, gap: 10 }, label: { fontSize: 12, fontWeight: '700', marginTop: 2 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }, error: { fontSize: 12, lineHeight: 17 }, button: { minHeight: 51, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingVertical: 10 }, buttonText: { fontWeight: '800', fontSize: 15 },
});
