import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { activeIssuesPath, readActiveIssues } from './active-issues';
import { createRefreshCoordinator } from './refresh-coordinator';
import { useSession } from './session';
import { sessionScope } from './session-authority';
import { useApiData } from './use-api';

type Snapshot = Awaited<ReturnType<typeof readActiveIssues>>;
const ActiveIssuesContext = createContext<ReturnType<typeof useApiData<Snapshot>> | null>(null);

export function ActiveIssuesProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const scope = sessionScope(session);
  const load = useMemo(() => {
    const coordinator = createRefreshCoordinator<Snapshot>();
    return (path: string, read: Parameters<typeof readActiveIssues>[1]) => coordinator.run(() => readActiveIssues(path, read));
  }, [scope]);
  const issues = useApiData(activeIssuesPath, !!scope, load);
  return <ActiveIssuesContext.Provider value={issues}>{children}</ActiveIssuesContext.Provider>;
}

export function useActiveIssues() {
  const issues = useContext(ActiveIssuesContext);
  if (!issues) throw new Error('ActiveIssuesProvider is missing');
  return issues;
}
