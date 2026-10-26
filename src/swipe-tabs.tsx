import { router } from 'expo-router';
import { type PropsWithChildren, useMemo } from 'react';
import { PanResponder, View } from 'react-native';
import { tabForSwipe, type MainTab } from './swipe-tabs-routing';

const paths: Record<MainTab, '/(tabs)' | '/(tabs)/monitors' | '/(tabs)/incidents' | '/(tabs)/more'> = {
  overview: '/(tabs)', status: '/(tabs)/monitors', incidents: '/(tabs)/incidents', more: '/(tabs)/more',
};

export function SwipeTab({ current, children }: PropsWithChildren<{ current: MainTab }>) {
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_, gesture) => {
      const next = tabForSwipe(current, gesture.dx, gesture.dy);
      if (next) router.navigate(paths[next]);
    },
  }), [current]);
  return <View style={{ flex: 1 }} {...responder.panHandlers}>{children}</View>;
}
