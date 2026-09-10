import { Collapse, InputNumber, Radio, Select, Space, Switch, Tooltip } from 'antd';
import { SlidersOutlined } from '@ant-design/icons';
import type { RetrievalOptions } from '../../types/applicationTypes';
export const defaultRetrievalOptions: RetrievalOptions = {
  query: '',
  method: 'hybrid',
  strategy: 'parent-child',
  scope: 'all',
  folderId: 'root',
  fileIds: [],
  rerank: false,
  candidateCount: 30,
  resultCount: 5,
  contextTokens: 4000,
};
export function RetrievalControls({
  options,
  onChange,
  folderName,
  selectedCount,
  disabled = false,
}: {
  options: RetrievalOptions;
  onChange: (options: RetrievalOptions) => void;
  folderName: string;
  selectedCount: number;
  disabled?: boolean;
}) {
  const update = (change: Partial<RetrievalOptions>) => onChange({ ...options, ...change });
  return (
    <div className="retrieval-controls">
      <div className="retrieval-control-row">
        <div className="retrieval-control-field">
          Search in
          <Select
            disabled={disabled}
            value={options.scope}
            onChange={(scope) => update({ scope })}
            style={{ minWidth: 200 }}
            options={[
              { value: 'all', label: 'All documents' },
              { value: 'folder', label: `${folderName} · this folder` },
              { value: 'subtree', label: `${folderName} · with subfolders` },
              {
                value: 'files',
                label: `Selected files (${selectedCount})`,
                disabled: !selectedCount,
              },
            ]}
          />
        </div>
        <div className="retrieval-control-field">
          Retrieval
          <Radio.Group
            disabled={disabled}
            value={options.method}
            onChange={(event) => update({ method: event.target.value })}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'vector', label: 'Vector' },
              { value: 'hybrid', label: 'Hybrid' },
            ]}
          />
        </div>
        <div className="retrieval-control-field">
          Context
          <Radio.Group
            disabled={disabled}
            value={options.strategy}
            onChange={(event) => update({ strategy: event.target.value })}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'parent-child', label: 'Parent-child' },
            ]}
          />
        </div>
        <div className="retrieval-control-field">
          Reranker
          <Tooltip title="Rerank retrieved candidates using your configured reranker">
            <Switch
              disabled={disabled}
              checked={options.rerank}
              onChange={(rerank) => update({ rerank })}
              checkedChildren="On"
              unCheckedChildren="Off"
            />
          </Tooltip>
        </div>
      </div>
      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'advanced',
            label: (
              <Space>
                <SlidersOutlined aria-hidden="true" />
                Retrieval tuning
              </Space>
            ),
            children: (
              <div className="retrieval-control-row">
                <div className="retrieval-control-field">
                  Candidate count
                  <InputNumber
                    disabled={disabled}
                    min={options.resultCount}
                    max={100}
                    value={options.candidateCount}
                    onChange={(value) => value && update({ candidateCount: value })}
                  />
                </div>
                <div className="retrieval-control-field">
                  Final matches
                  <InputNumber
                    disabled={disabled}
                    min={1}
                    max={Math.min(20, options.candidateCount)}
                    value={options.resultCount}
                    onChange={(value) => value && update({ resultCount: value })}
                  />
                </div>
                <div className="retrieval-control-field">
                  Context token budget
                  <InputNumber
                    disabled={disabled}
                    min={256}
                    max={16000}
                    step={256}
                    value={options.contextTokens}
                    onChange={(value) => value && update({ contextTokens: value })}
                  />
                </div>
                <p className="muted control-note">
                  Hybrid combines vector and keyword ranks. Parent-child expands small matches into
                  larger source passages. Token counts use cl100k_base; your model’s tokenizer may
                  differ.
                </p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
