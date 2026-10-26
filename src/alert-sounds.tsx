import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Vibration } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSession } from './session';
import { useAuthenticatedRequest } from './use-api';
import { AlertSoundController, defaultAlertSounds, parseAlertSounds, type AlertSound, type AlertSoundPreferences, type SoundCue } from './alert-sound-controller';

type SoundSettings = {
  preferences: AlertSoundPreferences;
  loading: boolean;
  ready: boolean;
  setPreference: (setting: keyof AlertSoundPreferences, enabled: boolean) => Promise<void>;
  testSound: (sound: AlertSound) => Promise<void>;
  testVibration: () => void;
};
const AlertSoundsContext = createContext<SoundSettings | null>(null);

export function AlertSoundsProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const request = useAuthenticatedRequest();
  const requestRef = useRef(request);
  requestRef.current = request;
  const userId = session?.user.ID;
  const key = userId ? `klimate.alert-sounds.v1.${userId}` : '';
  const scope = session ? `${userId}:${session.tenantId ?? ''}` : '';
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [saved, setSaved] = useState({ key: '', preferences: { ...defaultAlertSounds } });
  const loading = saved.key !== key;
  const preferences = loading ? defaultAlertSounds : saved.preferences;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const monitor = useAudioPlayer(require('../assets/sounds/monitor-down.wav'));
  const gateway = useAudioPlayer(require('../assets/sounds/gateway-down.wav'));
  const monitorStatus = useAudioPlayerStatus(monitor);
  const gatewayStatus = useAudioPlayerStatus(gateway);
  const ready = monitorStatus.isLoaded && gatewayStatus.isLoaded;
  const playbackId = useRef(0);

  useEffect(() => {
    let active = true;
    if (key) void SecureStore.getItemAsync(key)
      .then((value) => { if (active) setSaved({ key, preferences: parseAlertSounds(value) }); })
      .catch(() => { if (active) setSaved({ key, preferences: { ...defaultAlertSounds } }); });
    return () => { active = false; };
  }, [key]);

  const stopAudio = useCallback(() => {
    playbackId.current++;
    // Audio hooks may already have released native players during unmount/Fast Refresh.
    for (const player of [monitor, gateway]) {
      try { player.pause(); } catch { /* Already released: nothing remains to stop. */ }
    }
  }, [gateway, monitor]);
  const stop = useCallback(() => {
    stopAudio();
    Vibration.cancel();
  }, [stopAudio]);

  const vibrate = useCallback(() => {
    // One brief pulse; never a repeating alarm. iOS uses its system pulse duration.
    Vibration.vibrate(250);
  }, []);

  const play = useCallback(async (sound: AlertSound, current: () => boolean) => {
    if (AppState.currentState !== 'active' || !current()) return;
    stopAudio();
    const id = playbackId.current;
    const player = sound === 'monitorDown' ? monitor : gateway;
    if (!player.isLoaded) throw new Error('Sound is still loading. Please try again.');
    await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, allowsRecording: false, interruptionMode: 'mixWithOthers' });
    if (id !== playbackId.current || AppState.currentState !== 'active' || !current()) return;
    await player.seekTo(0);
    if (id !== playbackId.current || AppState.currentState !== 'active' || !current()) return;
    player.volume = .65;
    player.play();
  }, [gateway, monitor, stopAudio]);

  useEffect(() => {
    if (!scope || loading) return;
    const controller = new AlertSoundController(
      (path) => requestRef.current<SoundCue>(path),
      () => preferencesRef.current,
      async (sound, current) => {
        if (!current() || scopeRef.current !== scope || AppState.currentState !== 'active') return;
        stop();
        // Haptics are independent of sound toggles, audio availability, and silent mode.
        if (preferencesRef.current.vibrate) vibrate();
        if (preferencesRef.current[sound]) await play(sound, () => current() && scopeRef.current === scope && preferencesRef.current[sound]);
      },
    );
    if (AppState.currentState === 'active') controller.resume();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void controller.poll(); }, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      controller.pause(); stop();
      if (state === 'active') controller.resume();
    });
    return () => { controller.pause(); clearInterval(timer); subscription.remove(); stop(); };
  }, [loading, play, scope, stop, vibrate]);

  const setPreference = useCallback(async (sound: keyof AlertSoundPreferences, enabled: boolean) => {
    if (!key || loading) return;
    const next = { ...preferencesRef.current, [sound]: enabled };
    await SecureStore.setItemAsync(key, JSON.stringify(next));
    setSaved((previous) => previous.key === key ? { key, preferences: next } : previous);
    stop();
  }, [key, loading, stop]);
  const testSound = useCallback(async (sound: AlertSound) => {
    const testScope = scope;
    stop();
    await play(sound, () => !!testScope && scopeRef.current === testScope);
  }, [play, scope, stop]);
  const testVibration = useCallback(() => {
    if (!scope || AppState.currentState !== 'active') return;
    stop(); vibrate();
  }, [scope, stop, vibrate]);
  const value = useMemo(() => ({ preferences, loading, ready, setPreference, testSound, testVibration }), [preferences, loading, ready, setPreference, testSound, testVibration]);
  return <AlertSoundsContext.Provider value={value}>{children}</AlertSoundsContext.Provider>;
}

export function useAlertSounds() {
  const value = useContext(AlertSoundsContext);
  if (!value) throw new Error('Alert sound settings are unavailable.');
  return value;
}
