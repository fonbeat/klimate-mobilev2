import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useV2Theme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useV2Theme();
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.muted, sceneStyle: { backgroundColor: colors.canvas }, tabBarStyle: { height: 62 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(insets.bottom, 7), borderTopColor: colors.line, backgroundColor: colors.card }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
    <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
    <Tabs.Screen name="monitors" options={{ title: 'Monitors', tabBarIcon: ({ color, size }) => <Ionicons name="radio-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="incidents" options={{ title: 'Incidents', tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="notifications" options={{ href: null }} />
    <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} /> }} />
  </Tabs>;
}
