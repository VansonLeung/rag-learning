import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createBackendApiClient } from './backendApiClient';
const WorkspaceApiContext = createContext<ReturnType<typeof createBackendApiClient> | null>(null);
export function WorkspaceApiProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const client = useMemo(
    () => createBackendApiClient(`/api/workspaces/${encodeURIComponent(workspaceId)}`),
    [workspaceId],
  );
  return <WorkspaceApiContext.Provider value={client}>{children}</WorkspaceApiContext.Provider>;
}
export function useWorkspaceApi() {
  const client = useContext(WorkspaceApiContext);
  if (!client) throw new Error('Workspace API provider is missing');
  return client;
}
