import { useState, useRef, useEffect, type HTMLAttributes } from 'react';
import { Tree, Button } from 'antd';
import { FolderOutlined, FolderOpenOutlined, PlusOutlined, BookOutlined } from '@ant-design/icons';
import type { ExplorerNode } from '../../types/applicationTypes';
interface Props {
  nodes: ExplorerNode[];
  folderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: () => void;
  dragSourceProps: (id: string) => HTMLAttributes<HTMLElement>;
  dropTargetProps: (id: string) => HTMLAttributes<HTMLElement>;
}
export function LibraryFolderTree({
  nodes,
  folderId,
  onSelectFolder,
  onCreateFolder,
  dragSourceProps,
  dropTargetProps,
}: Props) {
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['root']);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  function folderTitle(id: string, name: string) {
    const target = dropTargetProps(id);
    return (
      <span
        {...dragSourceProps(id)}
        {...target}
        onDragEnter={() => {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(
            () => setExpandedKeys((previous) => [...new Set([...previous, id])]),
            600,
          );
        }}
        onDragLeave={(event) => {
          clearTimeout(hoverTimer.current);
          target.onDragLeave?.(event);
        }}
        className={`folder-drop-label ${target.className || ''}`}
      >
        {name}
      </span>
    );
  }
  function buildChildren(parentId: string): any[] {
    return nodes
      .filter((node) => node.kind === 'folder' && node.parent_id === parentId)
      .map((node) => ({
        key: node.id,
        title: folderTitle(node.id, node.name),
        icon: ({ expanded }: { expanded: boolean }) =>
          expanded ? (
            <FolderOpenOutlined aria-hidden="true" />
          ) : (
            <FolderOutlined aria-hidden="true" />
          ),
        children: buildChildren(node.id),
      }));
  }
  return (
    <>
      <div className="sidebar-section-label">
        WORKSPACE
        <Button
          type="text"
          size="small"
          aria-label="Create folder"
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={onCreateFolder}
        />
      </div>
      <Tree
        className="folder-tree"
        showIcon
        blockNode
        expandedKeys={expandedKeys}
        onExpand={(keys) => setExpandedKeys(keys.map(String))}
        selectedKeys={[folderId]}
        onSelect={(keys) => keys[0] && onSelectFolder(String(keys[0]))}
        treeData={[
          {
            key: 'root',
            title: folderTitle('root', 'Knowledge library'),
            icon: <BookOutlined aria-hidden="true" />,
            children: buildChildren('root'),
          },
        ]}
      />
    </>
  );
}
