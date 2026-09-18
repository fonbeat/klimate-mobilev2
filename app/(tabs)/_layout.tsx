import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '@/theme';

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.cyan, tabBarInactiveTintColor: colors.muted, sceneStyle: { backgroundColor: colors.canvas }, tabBarStyle: { height: 83, paddingTop: 8, paddingBottom: 19, borderTopColor: colors.line, backgroundColor: colors.deep }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' } }}>
    <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
    <Tabs.Screen name="monitors" options={{ title: 'Monitors', tabBarIcon: ({ color, size }) => <Ionicons name="radio-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="incidents" options={{ title: 'Incidents', tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} /> }} />
  </Tabs>;
}
