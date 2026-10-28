import { useEffect, useState, type DragEvent, type HTMLAttributes } from 'react';
import { App, Button, Modal, Space } from 'antd';
import { BackendApiError, postBackend } from '../../api/backendApiClient';
import { useExplorerClipboard, type ExplorerClipboard } from './ExplorerClipboardProvider';
import { readDroppedFiles } from './readDroppedFiles';
const dragType = 'application/x-grove-explorer';
interface PendingTransfer {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  nodeIds: string[];
  destinationFolderId: string;
  operation: 'copy' | 'move';
}
interface Options {
  workspaceId: string;
  folderId: string;
  selectedIds: string[];
  onRefresh: () => Promise<void>;
  onUpload: (files: File[], folderId?: string) => Promise<void>;
  enabled: boolean;
}
export function useExplorerTransferActions({
  workspaceId,
  folderId,
  selectedIds,
  onRefresh,
  onUpload,
  enabled,
}: Options) {
  const { message } = App.useApp();
  const { clipboard, setClipboard } = useExplorerClipboard();
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  function copySelection(operation: 'copy' | 'move', nodeIds = selectedIds) {
    if (!nodeIds.length) return;
    setClipboard({ workspaceId, nodeIds, operation });
    message.info(
      `${nodeIds.length} item(s) ${operation === 'copy' ? 'copied' : 'cut'}. Choose a destination and paste.`,
    );
  }
  async function performTransfer(transfer: PendingTransfer, conflict = 'ask') {
    setBusy(true);
    try {
      const result = await postBackend<{ copied: string[]; moved: string[]; skipped: string[] }>(
        '/transfers',
        { ...transfer, conflict },
      );
      setPending(null);
      if (transfer.operation === 'move') setClipboard(null);
      message.success(
        `${result.copied.length} copied · ${result.moved.length} moved · ${result.skipped.length} skipped`,
      );
      await onRefresh();
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 409 && error.data.conflicts) {
        setPending(transfer);
        setConflicts(error.data.conflicts);
      } else message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function pasteIntoFolder(destinationFolderId = folderId) {
    if (!clipboard) return;
    void performTransfer({
      sourceWorkspaceId: clipboard.workspaceId,
      targetWorkspaceId: workspaceId,
      nodeIds: clipboard.nodeIds,
      destinationFolderId,
      operation: clipboard.operation,
    });
  }
  useEffect(() => {
    function handleClipboardCommand(event: Event, command: string) {
      if (
        !enabled ||
        busy ||
        pending ||
        document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-drawer-open')
      )
        return;
      const element = document.activeElement;
      if (
        element?.matches(
          'input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true],[role=combobox]',
        )
      )
        return;
      if ((command === 'copy' || command === 'cut') && selectedIds.length) {
        event.preventDefault();
        copySelection(command === 'copy' ? 'copy' : 'move');
      } else if (command === 'paste' && clipboard) {
        event.preventDefault();
        pasteIntoFolder();
      }
    }
    function keydown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const command = { c: 'copy', x: 'cut', v: 'paste' }[event.key.toLowerCase()];
      if (command) handleClipboardCommand(event, command);
    }
    const desktopCommand = (event: Event) =>
      handleClipboardCommand(event, (event as CustomEvent<string>).detail);
    window.addEventListener('keydown', keydown);
    window.addEventListener('grove-explorer-command', desktopCommand);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('grove-explorer-command', desktopCommand);
    };
  });
  function dragSourceProps(nodeId: string): HTMLAttributes<HTMLElement> {
    return {
      draggable: nodeId !== 'root',
      onDragStart: (event) => {
        event.stopPropagation();
        const payload: ExplorerClipboard = {
          workspaceId,
          nodeIds: selectedIds.includes(nodeId) ? selectedIds : [nodeId],
          operation: 'move',
        };
        event.dataTransfer.setData(dragType, JSON.stringify(payload));
        event.dataTransfer.effectAllowed = 'copyMove';
      },
      onDragEnd: () => setHoverId(null),
    };
  }
  function dropTargetProps(destinationId: string): HTMLAttributes<HTMLElement> {
    return {
      onDragOver: (event) => {
        if (
          event.dataTransfer.types.includes(dragType) ||
          event.dataTransfer.types.includes('Files')
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect =
            event.altKey || event.ctrlKey || event.dataTransfer.types.includes('Files')
              ? 'copy'
              : 'move';
          setHoverId(destinationId);
        }
      },
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setHoverId(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setHoverId(null);
        const raw = event.dataTransfer.getData(dragType);
        if (raw) {
          try {
            const payload = JSON.parse(raw) as ExplorerClipboard;
            if (!Array.isArray(payload.nodeIds) || typeof payload.workspaceId !== 'string')
              throw new Error('Invalid drag selection');
            void performTransfer({
              sourceWorkspaceId: payload.workspaceId,
              targetWorkspaceId: workspaceId,
              nodeIds: payload.nodeIds,
              destinationFolderId: destinationId,
              operation:
                payload.workspaceId !== workspaceId || event.altKey || event.ctrlKey
                  ? 'copy'
                  : 'move',
            });
          } catch (error) {
            message.error((error as Error).message);
          }
        } else
          void readDroppedFiles(event.dataTransfer)
            .then((files) => onUpload(files, destinationId))
            .catch((error) => message.error(error.message));
      },
      className: hoverId === destinationId ? 'explorer-drop-target' : undefined,
    };
  }
  const conflictDialog = (
    <Modal
      open={!!pending}
      title="Items already exist"
      onCancel={() => setPending(null)}
      footer={
        <Space wrap>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button loading={busy} onClick={() => pending && void performTransfer(pending, 'skip')}>
            Skip existing
          </Button>
          <Button
            danger
            loading={busy}
            onClick={() => pending && void performTransfer(pending, 'replace')}
          >
            Replace existing
          </Button>
          <Button
            type="primary"
            loading={busy}
            onClick={() => pending && void performTransfer(pending, 'keep-both')}
          >
            Keep both
          </Button>
        </Space>
      }
    >
      <p>{conflicts.join(', ')}</p>
      <p>
        Replace deletes matching destination items and their contents. Keep both gives the incoming
        items new names.
      </p>
    </Modal>
  );
  return {
    clipboard,
    copySelection,
    pasteIntoFolder,
    dragSourceProps,
    dropTargetProps,
    conflictDialog,
    busy,
  };
}
