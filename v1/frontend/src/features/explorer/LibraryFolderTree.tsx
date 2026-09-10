import { Tree, Button } from 'antd';
import { FolderOutlined, FolderOpenOutlined, PlusOutlined, BookOutlined } from '@ant-design/icons';
import type { ExplorerNode } from '../../types/applicationTypes';
interface Props {
  nodes: ExplorerNode[];
  folderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: () => void;
}
export function LibraryFolderTree({ nodes, folderId, onSelectFolder, onCreateFolder }: Props) {
  function buildChildren(parentId: string): any[] {
    return nodes
      .filter((node) => node.kind === 'folder' && node.parent_id === parentId)
      .map((node) => ({
        key: node.id,
        title: node.name,
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
        defaultExpandAll
        selectedKeys={[folderId]}
        onSelect={(keys) => keys[0] && onSelectFolder(String(keys[0]))}
        treeData={[
          {
            key: 'root',
            title: 'Knowledge library',
            icon: <BookOutlined aria-hidden="true" />,
            children: buildChildren('root'),
          },
        ]}
      />
    </>
  );
}
