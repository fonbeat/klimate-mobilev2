import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useForegroundRefresh(refresh: () => unknown, enabled = true) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    refreshRef.current();
    let previous = AppState.currentState;
    const timer = setInterval(() => { if (AppState.currentState === 'active') refreshRef.current(); }, 30_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active') refreshRef.current();
      previous = next;
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [enabled]));
}
