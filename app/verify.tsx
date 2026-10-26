import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messageOf } from '@/api';
import { useSession } from '@/session';
import { useV2Theme } from '@/theme';

export default function Verify() {
  const { colors } = useV2Theme();
  const { pendingLoginChallenge, verify } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<TextInputInstance>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showKeyboard = useCallback((delay = 80) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // iOS can retain input focus while hiding its keyboard after an app switch.
    codeInput.current?.blur();
    focusTimer.current = setTimeout(() => { codeInput.current?.focus(); focusTimer.current = null; }, delay);
  }, []);

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active' && pendingLoginChallenge && !pendingLoginChallenge.mfaEnrollmentRequired) showKeyboard(250);
      previous = next;
    });
    return () => { subscription.remove(); if (focusTimer.current) clearTimeout(focusTimer.current); };
  }, [pendingLoginChallenge, showKeyboard]);
  async function submit() {
    if (code.trim().length < 6) return setError('Enter the code from your authenticator, or a recovery code.');
    setBusy(true); setError('');
    try { await verify(code.trim()); router.replace('/(tabs)'); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!pendingLoginChallenge) router.replace('/sign-in');
  }, [pendingLoginChallenge]);

  if (!pendingLoginChallenge) return null;

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" onPress={() => router.back()} style={styles.backButton}><Text style={[styles.back, { color: colors.blue }]}>‹ Back</Text></Pressable>
    <View style={styles.content}><Text style={[styles.eyebrow, { color: colors.blue }]}>TWO-STEP VERIFICATION</Text><Text style={[styles.title, { color: colors.ink }]}>{pendingLoginChallenge.mfaEnrollmentRequired ? 'Set up your authenticator' : 'Open your authenticator'}</Text><Text style={[styles.detail, { color: colors.muted }]}>{pendingLoginChallenge.mfaEnrollmentRequired ? 'Complete authenticator setup in Klimate on the web, then sign in here again.' : `Enter the current authenticator code for ${pendingLoginChallenge.email}, or use a recovery code.`}</Text>
      {!pendingLoginChallenge.mfaEnrollmentRequired && <><TextInput ref={codeInput} accessibilityLabel="Authenticator or recovery code" autoFocus autoCapitalize="characters" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={32} value={code} onChangeText={setCode} style={[styles.code, { backgroundColor: colors.card, borderColor: colors.line, color: colors.ink }]} onSubmitEditing={submit} /><Pressable accessibilityRole="button" accessibilityLabel="Show keyboard for verification code" onPress={() => showKeyboard()} style={styles.keyboardAction}><Text style={[styles.keyboardActionText, { color: colors.blue }]}>Use keyboard to enter code</Text></Pressable></>}
      {!!error && <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.down }]}>{error}</Text>}
      {!pendingLoginChallenge.mfaEnrollmentRequired && <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} onPress={submit} disabled={busy} style={[styles.button, { backgroundColor: colors.navy }]}>{busy ? <ActivityIndicator color={colors.onStatus} /> : <Text style={[styles.buttonText, { color: colors.onStatus }]}>Verify and open Klimate</Text>}</Pressable>}
    </View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, keyboard: { flex: 1 }, screen: { flexGrow: 1, padding: 24 }, backButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }, back: { fontSize: 16 }, content: { flexGrow: 1, justifyContent: 'center', gap: 13 }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { fontSize: 34, fontWeight: '800', letterSpacing: -1 }, detail: { fontSize: 15, lineHeight: 22 }, code: { minHeight: 66, paddingVertical: 8, borderWidth: 1, borderRadius: 15, textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 8, marginTop: 10 }, keyboardAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, keyboardActionText: { fontSize: 14, fontWeight: '700' }, error: { fontSize: 13 }, button: { minHeight: 53, paddingVertical: 10, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontSize: 15, fontWeight: '800' } });
