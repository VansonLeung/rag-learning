import { Button, Drawer, Empty, Progress, Space, Tag } from 'antd';
import type { IndexingJob } from '../../types/applicationTypes';
interface Props {
  open: boolean;
  jobs: IndexingJob[];
  onClose: () => void;
  onAction: (id: string, action: 'cancel' | 'retry') => void;
}
export function IndexingJobsDrawer({ open, jobs, onClose, onAction }: Props) {
  return (
    <Drawer open={open} onClose={onClose} title="Indexing activity" size={500}>
      <p className="muted">
        Documents are extracted and indexed in the background. Failed jobs can be retried after
        updating model settings.
      </p>
      {!jobs.length ? (
        <Empty description="No indexing jobs yet" />
      ) : (
        jobs.map((job) => (
          <div className="job-card" key={job.id}>
            <div className="flex-between">
              <strong>{job.document_name}</strong>
              <Tag
                color={
                  job.status === 'failed' ? 'red' : job.status === 'completed' ? 'green' : 'default'
                }
              >
                {job.status}
              </Tag>
            </div>
            <Progress
              percent={job.progress}
              size="small"
              status={
                job.status === 'failed'
                  ? 'exception'
                  : job.status === 'completed'
                    ? 'success'
                    : 'normal'
              }
            />
            <p className="muted">{job.message || 'Waiting to start'}</p>
            <Space>
              {['queued', 'running'].includes(job.status) && (
                <Button size="small" onClick={() => onAction(job.id, 'cancel')}>
                  Cancel
                </Button>
              )}
              {['failed', 'cancelled'].includes(job.status) && (
                <Button size="small" onClick={() => onAction(job.id, 'retry')}>
                  Retry
                </Button>
              )}
              <span className="muted">{new Date(job.created_at).toLocaleTimeString()}</span>
            </Space>
          </div>
        ))
      )}
    </Drawer>
  );
}
