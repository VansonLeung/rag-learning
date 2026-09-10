import { useState } from 'react';
import { Button, Drawer } from 'antd';
import { SlidersOutlined } from '@ant-design/icons';
import type { RetrievalOptions } from '../../types/applicationTypes';
import { RetrievalControls } from '../search/RetrievalControls';

export function ChatRetrievalSettings({
  options,
  onChange,
  folderName,
  selectedCount,
}: {
  options: RetrievalOptions;
  onChange: (options: RetrievalOptions) => void;
  folderName: string;
  selectedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const scopeLabel = {
    all: 'All documents',
    folder: `${folderName} · this folder`,
    subtree: `${folderName} · with subfolders`,
    files: `Selected files (${selectedCount})`,
  }[options.scope];

  return (
    <>
      <div className="chat-retrieval-summary">
        <span>
          <strong>{scopeLabel}</strong>
          <span className="muted">
            {' · '}
            {options.method === 'hybrid' ? 'Hybrid' : 'Vector'}
            {' · '}
            {options.strategy === 'parent-child' ? 'Parent-child' : 'Normal'}
            {options.rerank ? ' · Reranking on' : ''}
          </span>
        </span>
        <Button icon={<SlidersOutlined aria-hidden="true" />} onClick={() => setOpen(true)}>
          Retrieval settings
        </Button>
      </div>
      <Drawer title="Chat retrieval settings" open={open} onClose={() => setOpen(false)} size={520}>
        <p className="muted">Changes apply to your next question.</p>
        <RetrievalControls
          options={options}
          onChange={onChange}
          folderName={folderName}
          selectedCount={selectedCount}
        />
      </Drawer>
    </>
  );
}
