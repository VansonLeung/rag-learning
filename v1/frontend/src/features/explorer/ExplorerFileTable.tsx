import type { HTMLAttributes } from 'react';
import { Button, Dropdown, Empty, Space, Table, Tag, Typography } from 'antd';
import { FileTextOutlined, FolderFilled, MoreOutlined, UploadOutlined } from '@ant-design/icons';
import type { ExplorerNode, IndexingJob } from '../../types/applicationTypes';
export function formatFileSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
interface Props {
  nodes: ExplorerNode[];
  jobs: IndexingJob[];
  selectedIds: string[];
  loading: boolean;
  onSelect: (ids: string[]) => void;
  onOpen: (node: ExplorerNode) => void;
  onAction: (action: string, node: ExplorerNode) => void;
  onUpload: () => void;
  dragSourceProps: (id: string) => HTMLAttributes<HTMLElement>;
  dropTargetProps: (id: string) => HTMLAttributes<HTMLElement>;
}
export function ExplorerFileTable({
  nodes,
  jobs,
  selectedIds,
  loading,
  onSelect,
  onOpen,
  onAction,
  onUpload,
  dragSourceProps,
  dropTargetProps,
}: Props) {
  return (
    <Table<ExplorerNode>
      className="file-table"
      rowKey="id"
      loading={loading}
      dataSource={nodes}
      pagination={nodes.length > 20 ? { pageSize: 20 } : false}
      rowSelection={{
        selectedRowKeys: selectedIds,
        onChange: (keys) => onSelect(keys.map(String)),
      }}
      onRow={(node) => ({
        ...dragSourceProps(node.id),
        ...(node.kind === 'folder' ? dropTargetProps(node.id) : {}),
        onDoubleClick: () => onOpen(node),
      })}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <>
                <h3>A home for your knowledge</h3>
                <p>Upload documents or a folder to start exploring.</p>
              </>
            }
          >
            <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onUpload}>
              Add your first documents
            </Button>
          </Empty>
        ),
      }}
      columns={[
        {
          title: 'Name',
          key: 'name',
          width: 260,
          sorter: (a, b) => a.name.localeCompare(b.name),
          render: (_, node) => (
            <button className="file-name-button" onClick={() => onOpen(node)}>
              {node.kind === 'folder' ? (
                <FolderFilled aria-hidden="true" className="folder-icon" />
              ) : (
                <FileTextOutlined aria-hidden="true" className="document-icon" />
              )}
              <span>{node.name}</span>
            </button>
          ),
        },
        {
          title: 'Index status',
          key: 'status',
          width: 155,
          render: (_, node) => {
            if (node.kind === 'folder') return <span className="muted">—</span>;
            const job = jobs.find((job) => job.document_id === node.id);
            const status =
              job && ['queued', 'running', 'failed', 'cancelled'].includes(job.status)
                ? job.status
                : node.status;
            return (
              <Tag
                color={
                  status === 'ready'
                    ? 'green'
                    : status === 'failed'
                      ? 'red'
                      : status === 'stale'
                        ? 'orange'
                        : status === 'running'
                          ? 'processing'
                          : 'default'
                }
              >
                {status === 'ready' ? 'Indexed' : status === 'stale' ? 'Needs reindex' : status}
              </Tag>
            );
          },
        },
        {
          title: 'Size',
          dataIndex: 'size',
          width: 95,
          render: (size, node) => (node.kind === 'folder' ? '—' : formatFileSize(size)),
        },
        {
          title: 'Added',
          dataIndex: 'created_at',
          width: 125,
          render: (value) => (
            <Typography.Text type="secondary">
              {new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Typography.Text>
          ),
        },
        {
          title: '',
          key: 'actions',
          width: 52,
          render: (_, node) => (
            <Dropdown
              trigger={['click']}
              menu={{
                onClick: ({ key }) => onAction(key, node),
                items: [
                  { key: 'rename', label: 'Rename' },
                  { key: 'move', label: 'Move to folder' },
                  { key: 'copy', label: 'Copy' },
                  { key: 'cut', label: 'Cut' },
                  ...(node.kind === 'folder' ? [{ key: 'paste', label: 'Paste into folder' }] : []),
                  ...(node.kind === 'file'
                    ? [
                        { key: 'reindex', label: 'Reindex document' },
                        { key: 'download', label: 'Download original' },
                      ]
                    : []),
                  { type: 'divider' },
                  { key: 'delete', label: 'Delete', danger: true },
                ],
              }}
            >
              <Button
                type="text"
                aria-label={`Actions for ${node.name}`}
                icon={<MoreOutlined aria-hidden="true" />}
              />
            </Dropdown>
          ),
        },
      ]}
    />
  );
}
