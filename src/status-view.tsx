import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from './session';

export type StatusView = 'monitors' | 'targets' | 'services';
export const statusViews: StatusView[] = ['monitors', 'targets', 'services'];
export const statusViewLabel = (view: StatusView) => view[0].toUpperCase() + view.slice(1);

type StatusViewContextValue = {
  preferredView: StatusView;
  activeView: StatusView;
  setPreferredView: (view: StatusView) => void;
  setActiveView: (view: StatusView) => void;
};

const StatusViewContext = createContext<StatusViewContextValue | null>(null);

export function StatusViewProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.ID;
  const [preferredView, setPreferred] = useState<StatusView>('monitors');
  const [activeView, setActive] = useState<StatusView>('monitors');

  useEffect(() => {
    let current = true;
    setPreferred('monitors');
    setActive('monitors');
    if (userId) void SecureStore.getItemAsync(`klimate.status-view.${userId}`)
      .then((saved) => {
        if (!current || !statusViews.includes(saved as StatusView)) return;
        setPreferred(saved as StatusView);
        setActive(saved as StatusView);
      })
      .catch(() => undefined);
    return () => { current = false; };
  }, [userId]);

  const setPreferredView = useCallback((view: StatusView) => {
    setPreferred(view);
    setActive(view);
    if (userId) void SecureStore.setItemAsync(`klimate.status-view.${userId}`, view).catch(() => undefined);
  }, [userId]);

  const value = useMemo(() => ({ preferredView, activeView, setPreferredView, setActiveView: setActive }), [preferredView, activeView, setPreferredView]);
  return <StatusViewContext.Provider value={value}>{children}</StatusViewContext.Provider>;
}

export function useStatusView() {
  const context = useContext(StatusViewContext);
  if (!context) throw new Error('Status view is unavailable.');
  return context;
}
