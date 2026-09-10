import { useEffect, useState } from 'react';
import { App, Button, Dropdown, Input, Modal, Select, Space, Spin } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { requestBackend, postBackend } from '../../api/backendApiClient';
import { WorkspaceApiProvider } from '../../api/WorkspaceApiProvider';
import { ApplicationWorkspace } from '../../ApplicationWorkspace';
import { ExplorerClipboardProvider } from '../explorer/ExplorerClipboardProvider';
interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}
export function WorkspaceManagerApplication() {
  const { message, modal } = App.useApp();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState(localStorage.getItem('grove-workspace') || 'personal');
  const [editing, setEditing] = useState<'create' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refreshWorkspaces() {
    try {
      const items = await requestBackend<Workspace[]>('/workspaces');
      setWorkspaces(items);
      setActiveId((previous) =>
        items.some((item) => item.id === previous) ? previous : items[0].id,
      );
      setError('');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  useEffect(() => {
    void refreshWorkspaces();
    const refresh = () => void refreshWorkspaces();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    localStorage.setItem('grove-workspace', activeId);
  }, [activeId]);
  const current = workspaces.find((item) => item.id === activeId);
  async function saveWorkspace() {
    setBusy(true);
    try {
      if (editing === 'create') {
        const workspace = await postBackend<Workspace>('/workspaces', { name });
        setActiveId(workspace.id);
      } else
        await requestBackend(`/workspaces/${activeId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        });
      await refreshWorkspaces();
      setEditing(null);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function deleteWorkspace() {
    modal.confirm({
      title: `Delete workspace “${current?.name}”?`,
      content:
        'This permanently deletes its documents, indexes, model settings, and conversations. Other workspaces are unaffected.',
      okText: 'Delete workspace',
      okButtonProps: { danger: true },
      onOk: async () => {
        await requestBackend(`/workspaces/${activeId}`, { method: 'DELETE' });
        await refreshWorkspaces();
      },
    });
  }
  const switcher = (
    <div className="workspace-switcher">
      <div className="sidebar-section-label">
        WORKSPACES
        <Button
          type="text"
          size="small"
          aria-label="Create workspace"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setName('');
            setEditing('create');
          }}
        />
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Select
          aria-label="Active workspace"
          value={activeId}
          onChange={setActiveId}
          style={{ flex: 1, minWidth: 0 }}
          options={workspaces.map((item) => ({ value: item.id, label: item.name }))}
        />
        <Dropdown
          menu={{
            items: [
              { key: 'rename', label: 'Rename workspace' },
              {
                key: 'delete',
                label: 'Delete workspace',
                danger: true,
                disabled: workspaces.length < 2,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'delete') deleteWorkspace();
              else {
                setName(current?.name || '');
                setEditing('rename');
              }
            },
          }}
        >
          <Button aria-label="Workspace actions" icon={<MoreOutlined aria-hidden />} />
        </Dropdown>
      </Space.Compact>
      <small>Separate documents, models, and conversations</small>
    </div>
  );
  if (error)
    return (
      <div className="workspace-empty">
        <p>{error}</p>
        <Button onClick={() => void refreshWorkspaces()}>Retry connection</Button>
      </div>
    );
  return (
    <ExplorerClipboardProvider>
      {current ? (
        <WorkspaceApiProvider key={activeId} workspaceId={activeId}>
          <ApplicationWorkspace workspaceId={activeId} workspaceSwitcher={switcher} />
        </WorkspaceApiProvider>
      ) : (
        <div className="workspace-empty">
          <Spin />
        </div>
      )}
      <Modal
        open={!!editing}
        title={editing === 'create' ? 'Create workspace' : 'Rename workspace'}
        onCancel={() => setEditing(null)}
        onOk={() => void saveWorkspace()}
        confirmLoading={busy}
        okText={editing === 'create' ? 'Create workspace' : 'Save'}
        okButtonProps={{ disabled: !name.trim() }}
      >
        <Input
          aria-label="Workspace name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onPressEnter={() => name.trim() && void saveWorkspace()}
          placeholder="e.g. Research, Work, Personal"
        />
      </Modal>
    </ExplorerClipboardProvider>
  );
}
