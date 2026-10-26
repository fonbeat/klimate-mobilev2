import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { useV2Theme } from '@/theme';
import { useSession } from '@/session';

export default function TabsLayout() {
  const { colors } = useV2Theme();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return <Tabs key={session?.tenantId ?? 'none'} screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.muted, sceneStyle: { backgroundColor: colors.canvas }, tabBarStyle: { height: Math.max(62, 48 + 14 * Math.min(fontScale, 2)) + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 5), borderTopColor: colors.line, backgroundColor: colors.card }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
    <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ focused, size }) => <Ionicons name="pulse" color={focused ? colors.blue : colors.muted} size={size} /> }} />
    <Tabs.Screen name="monitors" options={{ title: 'Status', tabBarIcon: ({ focused, size }) => <Ionicons name="radio-outline" color={focused ? colors.blue : colors.muted} size={size} /> }} />
    <Tabs.Screen name="incidents" options={{ title: 'Incidents', tabBarIcon: ({ focused, size }) => <Ionicons name="alert-circle-outline" color={focused ? colors.blue : colors.muted} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: 'Gateways', tabBarIcon: ({ focused, size }) => <MaterialCommunityIcons name="server-network-outline" color={focused ? colors.blue : colors.muted} size={size} /> }} />
  </Tabs>;
}
