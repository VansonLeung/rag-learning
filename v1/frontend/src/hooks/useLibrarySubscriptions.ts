import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceApi } from '../api/WorkspaceApiProvider';
import type { ExplorerNode, IndexingJob } from '../types/applicationTypes';
export function useLibrarySubscriptions(onError: (error: unknown) => void) {
  const { requestBackend, urlFor } = useWorkspaceApi();
  const [nodes, setNodes] = useState<ExplorerNode[]>([]);
  const [jobs, setJobs] = useState<IndexingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const [nodes, jobs] = await Promise.all([
        requestBackend<ExplorerNode[]>('/nodes'),
        requestBackend<IndexingJob[]>('/jobs'),
      ]);
      setNodes(nodes);
      setJobs(jobs);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [onError, requestBackend]);
  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const source = new EventSource(urlFor('/events'));
    source.onmessage = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    source.onopen = () => void refresh();
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [refresh]);
  return { nodes, jobs, loading, refresh };
}
