import { Redirect } from 'expo-router';
import { useSession } from '@/session';

export default function Index() {
  const { session, pendingLoginChallenge } = useSession();
  return <Redirect href={session ? '/(tabs)' : pendingLoginChallenge ? '/verify' : '/sign-in'} />;
}
