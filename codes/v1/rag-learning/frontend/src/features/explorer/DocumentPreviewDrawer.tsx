import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Select, Space, Spin, Tabs, Tag } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { useWorkspaceApi } from '../../api/WorkspaceApiProvider';
import type { ExplorerNode } from '../../types/applicationTypes';
interface Chunk {
  id: string;
  kind: string;
  parent_chunk_id: string | null;
  content: string;
  start_offset: number;
  end_offset: number;
}
export interface PreviewTarget {
  documentId: string;
  startOffset?: number;
  endOffset?: number;
}
export function DocumentPreviewDrawer({
  target,
  onClose,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
}) {
  const { requestBackend, urlFor } = useWorkspaceApi();
  const [data, setData] = useState<{ node: ExplorerNode; text: string; chunks: Chunk[] }>();
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError('');
    if (target)
      requestBackend<typeof data>(`/nodes/${target.documentId}/content`)
        .then((value) => {
          if (active) setData(value);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    return () => {
      active = false;
    };
  }, [target]);
  useEffect(() => {
    if (data && target?.startOffset !== undefined)
      setTimeout(
        () =>
          document
            .getElementById('source-passage')
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
        200,
      );
  }, [data, target]);
  const text = data?.text ?? '';
  const start = target?.startOffset;
  const end = target?.endOffset;
  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      size={720}
      title={
        <Space>
          <FileTextOutlined aria-hidden="true" />
          {data?.node.name || 'Document preview'}
        </Space>
      }
      extra={
        target && (
          <Button
            icon={<DownloadOutlined aria-hidden="true" />}
            href={urlFor(`/nodes/${target.documentId}/download`)}
          >
            Original
          </Button>
        )
      }
    >
      {error ? (
        <Alert type="error" title={error} />
      ) : !data ? (
        <Spin />
      ) : (
        <Tabs
          items={[
            {
              key: 'text',
              label: 'Extracted text',
              children: text ? (
                <pre className="document-text">
                  {start !== undefined ? (
                    <>
                      {text.slice(0, start)}
                      <mark id="source-passage">{text.slice(start, end)}</mark>
                      {text.slice(end)}
                    </>
                  ) : (
                    text
                  )}
                </pre>
              ) : (
                <Empty description="Text will appear after the extraction step. Check indexing jobs for progress or errors." />
              ),
            },
            {
              key: 'chunks',
              label: `Chunks (${data.chunks.length})`,
              children: (
                <>
                  <Select
                    value={kind}
                    onChange={setKind}
                    style={{ width: 200, marginBottom: 16 }}
                    options={['all', 'normal', 'child', 'parent'].map((value) => ({
                      value,
                      label: `${value[0].toUpperCase() + value.slice(1)} chunks`,
                    }))}
                  />
                  {data.chunks
                    .filter((chunk) => kind === 'all' || chunk.kind === kind)
                    .map((chunk) => (
                      <div className="chunk-card" key={chunk.id}>
                        <Space>
                          <Tag>{chunk.kind}</Tag>
                          <span className="muted">
                            Characters {chunk.start_offset}–{chunk.end_offset}
                          </span>
                        </Space>
                        {chunk.parent_chunk_id && (
                          <div className="chunk-id">Parent: {chunk.parent_chunk_id}</div>
                        )}
                        <pre>{chunk.content}</pre>
                      </div>
                    ))}
                </>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
