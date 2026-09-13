import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useExplorerTransferActions } from './features/explorer/useExplorerTransferActions';
import {
  Alert,
  App,
  Badge,
  Breadcrumb,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Tooltip,
} from 'antd';
import {
  BookOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  CommentOutlined,
  ExperimentOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useLibrarySubscriptions } from './hooks/useLibrarySubscriptions';
import { useWorkspaceApi } from './api/WorkspaceApiProvider';
import type { ExplorerNode, ApplicationSettings } from './types/applicationTypes';
import { LibraryFolderTree } from './features/explorer/LibraryFolderTree';
import { ExplorerFileTable } from './features/explorer/ExplorerFileTable';
import {
  DocumentPreviewDrawer,
  type PreviewTarget,
} from './features/explorer/DocumentPreviewDrawer';
import { IndexingJobsDrawer } from './features/jobs/IndexingJobsDrawer';
import { ModelSettingsDrawer } from './features/settings/ModelSettingsDrawer';
import { RetrievalControls, defaultRetrievalOptions } from './features/search/RetrievalControls';
import { SearchWorkspace } from './features/search/SearchWorkspace';
import { ChatRetrievalSettings } from './features/chat/ChatRetrievalSettings';
import { ChatWorkspace } from './features/chat/ChatWorkspace';
import { RetrievalComparisonWorkspace } from './features/search/RetrievalComparisonWorkspace';
import { LearningDrawer } from './features/learning/LearningDrawer';
export function ApplicationWorkspace({
  workspaceId,
  workspaceSwitcher,
}: {
  workspaceId: string;
  workspaceSwitcher: ReactNode;
}) {
  const { requestBackend, postBackend, urlFor } = useWorkspaceApi();
  const { message, modal } = App.useApp();
  const reportError = useCallback(
    (error: unknown) => {
      void message.error(error instanceof Error ? error.message : 'Operation failed');
    },
    [message],
  );
  const { nodes, jobs, loading, refresh } = useLibrarySubscriptions(reportError);
  const [folderId, setFolderId] = useState('root');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tab, setTab] = useState('explorer');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [options, setOptions] = useState(defaultRetrievalOptions);
  const [filenameFilter, setFilenameFilter] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<{
    action: 'create' | 'rename' | 'move';
    node?: ExplorerNode;
  } | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const files = nodes.filter((node) => node.kind === 'file');
  const indexed = files.filter((node) => node.status === 'ready').length;
  const activeJobs = jobs.filter((job) => ['queued', 'running'].includes(job.status));
  const folder = nodes.find((node) => node.id === folderId);
  const selectedFileIds = selectedIds.filter((id) => files.some((file) => file.id === id));
  const currentOptions = { ...options, folderId, fileIds: selectedFileIds };
  const transfers = useExplorerTransferActions({
    workspaceId,
    folderId,
    selectedIds,
    onRefresh: refresh,
    onUpload: uploadFiles,
    enabled: tab === 'explorer',
  });
  const loadSettings = useCallback(() => {
    requestBackend<ApplicationSettings>('/settings')
      .then((settings) =>
        setConfigured(Boolean(settings.embedding.baseUrl && settings.embedding.model)),
      )
      .catch(reportError);
  }, [reportError]);
  useEffect(loadSettings, [loadSettings]);
  useEffect(() => {
    if (!loading && !nodes.some((node) => node.id === folderId)) setFolderId('root');
    setSelectedIds((previous) => previous.filter((id) => nodes.some((node) => node.id === id)));
  }, [nodes, loading, folderId]);
  function selectFolder(id: string) {
    setFolderId(id);
    setSelectedIds([]);
    setFilenameFilter('');
  }
  function openCreateFolder() {
    setDialog({ action: 'create' });
    setDialogValue('');
  }
  async function indexDocuments(ids: string[]) {
    try {
      await postBackend('/jobs/index', { documentIds: ids });
      setJobsOpen(true);
      await refresh();
    } catch (error) {
      reportError(error);
    }
  }
  async function uploadFiles(incoming: File[], destinationFolderId = folderId) {
    if (!incoming.length) return;
    setUploading(true);
    setUploadFailures([]);
    let added = 0;
    let duplicates = 0;
    const failures: string[] = [];
    try {
      // Small batches bound server memory while preserving folder-relative paths.
      for (let offset = 0; offset < incoming.length; offset += 5) {
        const batch = incoming.slice(offset, offset + 5);
        const form = new FormData();
        form.append('parentId', destinationFolderId);
        form.append(
          'paths',
          JSON.stringify(batch.map((file) => file.webkitRelativePath || file.name)),
        );
        batch.forEach((file) => form.append('files', file));
        const result = await requestBackend<{
          results: { duplicate?: boolean; error?: string; name: string }[];
        }>('/upload', { method: 'POST', body: form });
        result.results.forEach((file) => {
          if (file.error) failures.push(`${file.name}: ${file.error}`);
          else if (file.duplicate) duplicates++;
          else added++;
        });
      }
      message.success(
        `${added} document(s) added${duplicates ? ` · ${duplicates} duplicate(s) skipped` : ''}`,
      );
      setUploadFailures(failures);
      await refresh();
    } catch (error) {
      reportError(error);
      setUploadFailures(failures);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
      if (folderInput.current) folderInput.current.value = '';
    }
  }
  function handleNodeAction(action: string, node: ExplorerNode) {
    if (action === 'copy' || action === 'cut') {
      transfers.copySelection(action === 'copy' ? 'copy' : 'move', [node.id]);
      return;
    }
    if (action === 'paste') {
      transfers.pasteIntoFolder(node.id);
      return;
    }
    if (action === 'download') {
      window.location.href = urlFor(`/nodes/${node.id}/download`);
      return;
    }
    if (action === 'reindex') {
      void indexDocuments([node.id]);
      return;
    }
    if (action === 'delete') {
      modal.confirm({
        title: `Delete “${node.name}”?`,
        content:
          node.kind === 'folder'
            ? 'This deletes the folder, its contents, and their indexes.'
            : 'This deletes the document and its index.',
        okText: 'Delete',
        okButtonProps: { danger: true },
        onOk: async () => {
          await requestBackend(`/nodes/${node.id}`, { method: 'DELETE' });
          await refresh();
        },
      });
      return;
    }
    if (action === 'rename' || action === 'move') {
      setDialog({ action, node });
      setDialogValue(action === 'rename' ? node.name : node.parent_id || 'root');
    }
  }
  async function submitDialog() {
    if (!dialog) return;
    setDialogBusy(true);
    try {
      if (dialog.action === 'create')
        await postBackend('/folders', { parentId: folderId, name: dialogValue });
      else
        await requestBackend(`/nodes/${dialog.node!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(
            dialog.action === 'rename' ? { name: dialogValue } : { parentId: dialogValue },
          ),
        });
      setDialog(null);
      await refresh();
    } catch (error) {
      reportError(error);
    } finally {
      setDialogBusy(false);
    }
  }
  const ancestors: ExplorerNode[] = [];
  let cursor = folder;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    ancestors.unshift(cursor);
    cursor = nodes.find((node) => node.id === cursor?.parent_id);
  }
  const children = nodes.filter(
    (node) =>
      node.parent_id === folderId && node.name.toLowerCase().includes(filenameFilter.toLowerCase()),
  );
  const tabItems = [
    {
      key: 'explorer',
      label: (
        <Space>
          <FolderOpenOutlined aria-hidden="true" />
          Explorer
        </Space>
      ),
    },
    {
      key: 'search',
      label: (
        <Space>
          <SearchOutlined aria-hidden="true" />
          Search
        </Space>
      ),
    },
    {
      key: 'chat',
      label: (
        <Space>
          <CommentOutlined aria-hidden="true" />
          Ask your library
        </Space>
      ),
    },
    {
      key: 'compare',
      label: (
        <Space>
          <ExperimentOutlined aria-hidden="true" />
          Compare
        </Space>
      ),
    },
  ];
  return (
    <div className="application-shell">
      <aside className="sidebar">
        {workspaceSwitcher}
        <LibraryFolderTree
          nodes={nodes}
          folderId={folderId}
          onSelectFolder={selectFolder}
          onCreateFolder={openCreateFolder}
          dragSourceProps={transfers.dragSourceProps}
          dropTargetProps={transfers.dropTargetProps}
        />
        <div className="sidebar-bottom">
          <Button
            type="text"
            block
            icon={<SettingOutlined aria-hidden="true" />}
            onClick={() => setSettingsOpen(true)}
          >
            Model connections
          </Button>
          <Button
            type="text"
            block
            icon={<ThunderboltOutlined aria-hidden="true" />}
            onClick={() => setJobsOpen(true)}
          >
            Indexing activity <Badge count={activeJobs.length} color="#477c62" />
          </Button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Breadcrumb
            items={ancestors.map((node) => ({
              title: (
                <button className="breadcrumb-button" onClick={() => selectFolder(node.id)}>
                  {node.id === 'root' ? (
                    <>
                      <BookOutlined aria-hidden="true" /> Knowledge library
                    </>
                  ) : (
                    node.name
                  )}
                </button>
              ),
            }))}
          />
          <Space>
            <Button type="text" onClick={() => setLearningOpen(true)}>
              Practice
            </Button>
            <Tooltip
              title={`${files.length} documents · ${nodes.filter((node) => node.kind === 'folder' && node.id !== 'root').length} folders · ${indexed} ready to search · ${activeJobs.length} indexing jobs`}
            >
              <Button
                type="text"
                className="index-status-button"
                aria-label="View library indexing status"
                onClick={() => setJobsOpen(true)}
                icon={<DatabaseOutlined aria-hidden="true" />}
              >
                {activeJobs.length
                  ? `${activeJobs.length} indexing`
                  : `${indexed}/${files.length} ready`}
              </Button>
            </Tooltip>
            <Tooltip title="Model connections">
              <Button
                aria-label="Open model settings"
                type="text"
                icon={<SettingOutlined aria-hidden="true" />}
                onClick={() => setSettingsOpen(true)}
              />
            </Tooltip>
          </Space>
        </header>
        <main className="workspace-main">
          {configured === false && (
            <div className="setup-banner">
              <ThunderboltOutlined aria-hidden="true" />
              <span>Connect an embedding model to index and search.</span>
              <Button onClick={() => setSettingsOpen(true)}>Set up models</Button>
            </div>
          )}
          <Tabs className="workspace-tabs" activeKey={tab} onChange={setTab} items={tabItems} />
          <div className={`workspace-content ${tab === 'chat' ? 'workspace-content-chat' : ''}`}>
            {tab === 'explorer' ? (
              <>
                <div className="explorer-toolbar">
                  <div>
                    <h1>{folderId === 'root' ? 'All files & folders' : folder?.name}</h1>
                    <span className="muted">
                      {children.length} items in this folder
                      {selectedIds.length ? ` · ${selectedIds.length} selected` : ''}
                    </span>
                  </div>
                  <Space wrap className="explorer-file-actions">
                    <Button
                      icon={<FolderAddOutlined aria-hidden="true" />}
                      onClick={openCreateFolder}
                    >
                      New folder
                    </Button>
                    <Button onClick={() => folderInput.current?.click()} disabled={uploading}>
                      Upload folder
                    </Button>
                    <Button
                      type="primary"
                      icon={<CloudUploadOutlined aria-hidden="true" />}
                      loading={uploading}
                      onClick={() => fileInput.current?.click()}
                    >
                      Upload documents
                    </Button>
                  </Space>
                </div>
                <div className="explorer-filter-toolbar">
                  <Input
                    prefix={<SearchOutlined aria-hidden="true" />}
                    placeholder="Filter filenames…"
                    aria-label="Filter filenames"
                    value={filenameFilter}
                    allowClear
                    onChange={(event) => setFilenameFilter(event.target.value)}
                    className="filename-filter"
                  />
                  <Space wrap>
                    {transfers.clipboard && (
                      <Button onClick={() => transfers.pasteIntoFolder()} disabled={transfers.busy}>
                        Paste
                      </Button>
                    )}
                    {selectedIds.length > 0 && (
                      <>
                        <Button onClick={() => transfers.copySelection('copy')}>Copy</Button>
                        <Button onClick={() => transfers.copySelection('move')}>Cut</Button>
                        <Button
                          disabled={!selectedFileIds.length}
                          onClick={() => {
                            setOptions({ ...options, scope: 'files' });
                            setTab('search');
                          }}
                        >
                          Search selected
                        </Button>
                        <Button
                          icon={<ReloadOutlined aria-hidden="true" />}
                          disabled={!selectedFileIds.length}
                          onClick={() => void indexDocuments(selectedFileIds)}
                        >
                          Reindex
                        </Button>
                      </>
                    )}
                  </Space>
                </div>
                <ExplorerFileTable
                  nodes={children}
                  jobs={jobs}
                  selectedIds={selectedIds}
                  loading={loading}
                  onSelect={setSelectedIds}
                  onOpen={(node) =>
                    node.kind === 'folder'
                      ? selectFolder(node.id)
                      : setPreview({ documentId: node.id })
                  }
                  onAction={handleNodeAction}
                  onUpload={() => fileInput.current?.click()}
                  onNavigateParent={
                    folder?.parent_id ? () => selectFolder(folder.parent_id!) : undefined
                  }
                  dragSourceProps={transfers.dragSourceProps}
                  dropTargetProps={transfers.dropTargetProps}
                />
                <div
                  {...transfers.dropTargetProps(folderId)}
                  className={`drop-zone ${transfers.dropTargetProps(folderId).className || ''}`}
                >
                  <CloudUploadOutlined aria-hidden="true" />
                  <span>{uploading ? 'Uploading…' : 'Drop files here or upload a folder'}</span>
                  <small>TXT, Markdown, PDF, DOCX · up to 25 MB per file</small>
                </div>
                {uploadFailures.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    title={`${uploadFailures.length} file(s) could not be uploaded`}
                    description={
                      <ul>
                        {uploadFailures.map((failure, index) => (
                          <li key={index}>{failure}</li>
                        ))}
                      </ul>
                    }
                    closable
                  />
                )}
              </>
            ) : (
              <>
                {tab === 'chat' ? (
                  <ChatRetrievalSettings
                    options={currentOptions}
                    onChange={setOptions}
                    folderName={folder?.name || 'Library'}
                    selectedCount={selectedFileIds.length}
                  />
                ) : (
                  <RetrievalControls
                    options={currentOptions}
                    onChange={setOptions}
                    folderName={folder?.name || 'Library'}
                    selectedCount={selectedFileIds.length}
                  />
                )}
                {tab === 'search' && (
                  <SearchWorkspace
                    options={currentOptions}
                    onChange={setOptions}
                    onPreview={setPreview}
                    onAsk={() => setTab('chat')}
                  />
                )}
                {tab === 'chat' && (
                  <ChatWorkspace options={currentOptions} onPreview={setPreview} />
                )}{' '}
                {tab === 'compare' && (
                  <RetrievalComparisonWorkspace
                    options={currentOptions}
                    onChange={setOptions}
                    onPreview={setPreview}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.pdf,.docx"
        hidden
        onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        {...{ webkitdirectory: '' }}
        hidden
        onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
      />
      {transfers.conflictDialog}
      <ModelSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          loadSettings();
          void refresh();
        }}
        onReindexAll={() => void indexDocuments(files.map((file) => file.id))}
        documentCount={files.length}
      />
      <LearningDrawer open={learningOpen} onClose={() => setLearningOpen(false)} />
      <DocumentPreviewDrawer target={preview} onClose={() => setPreview(null)} />
      <IndexingJobsDrawer
        open={jobsOpen}
        jobs={jobs}
        onClose={() => setJobsOpen(false)}
        onAction={(id, action) => {
          void postBackend(`/jobs/${id}/${action}`).then(refresh).catch(reportError);
        }}
      />
      <Modal
        open={!!dialog}
        title={
          dialog?.action === 'create'
            ? 'Create a folder'
            : dialog?.action === 'rename'
              ? 'Rename item'
              : 'Move to folder'
        }
        onCancel={() => setDialog(null)}
        onOk={() => void submitDialog()}
        confirmLoading={dialogBusy}
        okButtonProps={{ disabled: !dialogValue.trim() }}
        okText={dialog?.action === 'create' ? 'Create folder' : 'Save'}
      >
        {dialog?.action === 'move' ? (
          <Select
            aria-label="Destination folder"
            value={dialogValue}
            onChange={setDialogValue}
            style={{ width: '100%' }}
            options={nodes
              .filter((node) => node.kind === 'folder' && node.id !== dialog.node?.id)
              .map((node) => ({ value: node.id, label: node.path || 'Knowledge library' }))}
          />
        ) : (
          <Input
            aria-label="Item name"
            autoFocus
            value={dialogValue}
            onChange={(event) => setDialogValue(event.target.value)}
            onPressEnter={() => void submitDialog()}
            placeholder="Folder name"
          />
        )}
      </Modal>
    </div>
  );
}
