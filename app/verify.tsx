import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messageOf } from '@/api';
import { useSession } from '@/session';
import { colors } from '@/theme';

export default function Verify() {
  const { pendingLoginChallenge, verify } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (code.trim().length < 4) return setError('Enter the verification code from your email.');
    setBusy(true); setError('');
    try { await verify(code.trim()); router.replace('/(tabs)'); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!pendingLoginChallenge) router.replace('/sign-in');
  }, [pendingLoginChallenge]);

  if (!pendingLoginChallenge) return null;

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
    <View style={styles.content}><Text style={styles.eyebrow}>TWO-STEP VERIFICATION</Text><Text style={styles.title}>Check your email</Text><Text style={styles.detail}>Enter the one-time code sent to {pendingLoginChallenge.email}.</Text>
      <TextInput accessibilityLabel="Verification code" autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={8} value={code} onChangeText={setCode} style={styles.code} onSubmitEditing={submit} />
      {!!error && <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} onPress={submit} disabled={busy} style={styles.button}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Verify and open Klimate</Text>}</Pressable>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, screen: { flex: 1, padding: 24 }, back: { color: colors.blue, fontSize: 16, paddingVertical: 10 }, content: { flex: 1, justifyContent: 'center', gap: 13 }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: -1 }, detail: { color: colors.muted, fontSize: 15, lineHeight: 22 }, code: { height: 66, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 15, textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 8, color: colors.ink, marginTop: 10 }, error: { color: colors.down, fontSize: 13 }, button: { height: 53, backgroundColor: colors.navy, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: 'white', fontSize: 15, fontWeight: '800' } });
