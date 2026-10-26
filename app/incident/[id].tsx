import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Page, State } from '@/components';
import { IncidentSummary } from '@/incident-summary';
import type { IncidentDetails } from '@/incident-presentation';
import { useApiData } from '@/use-api';
import { useForegroundRefresh } from '@/use-foreground-refresh';
import { useSession } from '@/session';
import { useV2Theme } from '@/theme';
import { typography } from '@/tokens';

export default function IncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return <IncidentScreen key={`${session?.tenantId}:${id}`} id={id} />;
}

function IncidentScreen({ id }: { id: string }) {
  const { colors } = useV2Theme();
  const valid = typeof id === 'string' && !!id;
  const result = useApiData<IncidentDetails>(valid ? `/v2/incidents/${encodeURIComponent(id)}` : '', valid);
  useForegroundRefresh(result.refreshBackground, valid);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <Page refreshing={result.refreshing} onRefresh={result.reload}>
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 48, height: 48, justifyContent: 'center' }}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text accessibilityRole="header" style={[typography.sectionTitle, { color: colors.ink }]}>Incident details</Text><View style={{ width: 48 }} />
      </View>
      <State loading={result.loading && !result.data} loadingMessage="Loading incident…" error={valid ? result.error : 'This incident is unavailable.'} onRetry={result.reload} />
      {result.data && <IncidentSummary report={result.data} />}
    </Page>
  </SafeAreaView>;
}
