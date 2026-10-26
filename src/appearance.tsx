import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const APPEARANCE_KEY = 'klimate.appearance.v1';

export type Appearance = 'system' | 'light' | 'dark';

type AppearanceContextValue = {
  appearance: Appearance;
  scheme: 'light' | 'dark';
  loading: boolean;
  setAppearance: (appearance: Appearance) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: PropsWithChildren) {
  const deviceScheme = useColorScheme();
  const [appearance, setSelectedAppearance] = useState<Appearance>('system');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(APPEARANCE_KEY)
      .then((saved) => {
        if (active && (saved === 'system' || saved === 'light' || saved === 'dark')) setSelectedAppearance(saved);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setSelectedAppearance(next);
    void SecureStore.setItemAsync(APPEARANCE_KEY, next).catch(() => undefined);
  }, []);

  const scheme = appearance === 'system' ? (deviceScheme === 'light' ? 'light' : 'dark') : appearance;
  const value = useMemo(() => ({ appearance, scheme, loading, setAppearance }), [appearance, scheme, loading, setAppearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('Appearance preference is unavailable.');
  return context;
}
