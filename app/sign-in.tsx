import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messageOf } from '@/api';
import { useSession } from '@/session';
import { colors } from '@/theme';

export default function SignIn() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true); setError('');
    try {
      await login(email, password);
      router.push('/verify');
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brand}><View style={styles.mark}><View style={styles.sun} /><View style={styles.horizon} /></View><Text style={styles.wordmark}>Klimate</Text></View>
        <View style={styles.copy}><Text style={styles.eyebrow}>YOUR ENVIRONMENT, WITH YOU</Text><Text style={styles.title}>Know what’s happening. Wherever you are.</Text><Text style={styles.subtitle}>Secure access to your enterprise monitoring from anywhere.</Text></View>
        <View style={styles.form}>
          <Text style={styles.label}>Work email</Text>
          <TextInput accessibilityLabel="Work email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@company.com" placeholderTextColor="#8794A1" style={styles.input} />
          <Text style={styles.label}>Password</Text>
          <TextInput accessibilityLabel="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor="#8794A1" style={styles.input} onSubmitEditing={submit} />
          {!!error && <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} onPress={submit} disabled={busy} style={({ pressed }) => [styles.button, pressed && { opacity: .86 }, busy && { opacity: .7 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue securely</Text>}</Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.deep }, screen: { flex: 1, padding: 26, justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 }, mark: { width: 32, height: 32, borderWidth: 1.5, borderColor: colors.cyan, overflow: 'hidden' }, sun: { position: 'absolute', width: 13, height: 13, borderRadius: 13, backgroundColor: '#FF9B55', top: 5, left: 9 }, horizon: { position: 'absolute', width: 38, height: 16, borderRadius: 30, backgroundColor: colors.cyan, bottom: -8, left: -4 }, wordmark: { color: 'white', fontSize: 23, fontWeight: '800', letterSpacing: -.7 },
  copy: { gap: 12, marginTop: 46, marginBottom: 28 }, eyebrow: { color: colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, title: { color: 'white', fontSize: 39, lineHeight: 43, letterSpacing: -1.5, fontWeight: '800' }, subtitle: { color: '#AAB8C6', fontSize: 15, lineHeight: 22, maxWidth: 330 },
  form: { backgroundColor: 'white', padding: 20, borderRadius: 22, gap: 10 }, label: { color: colors.deep, fontSize: 12, fontWeight: '700', marginTop: 2 }, input: { height: 50, borderWidth: 1, borderColor: '#DDE4EA', backgroundColor: '#FAFBFC', borderRadius: 12, paddingHorizontal: 14, color: colors.deep, fontSize: 15 }, error: { color: '#C92C3C', fontSize: 12, lineHeight: 17 }, button: { height: 51, borderRadius: 12, backgroundColor: '#0C3268', alignItems: 'center', justifyContent: 'center', marginTop: 4 }, buttonText: { color: 'white', fontWeight: '800', fontSize: 15 },
});
