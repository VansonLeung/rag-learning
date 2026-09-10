import { useState } from 'react';
import { Alert, Button, Empty, Input, Space } from 'antd';
import { SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import type { RetrievalOptions, RetrievalResult } from '../../types/applicationTypes';
import type { PreviewTarget } from '../explorer/DocumentPreviewDrawer';
import { postBackend } from '../../api/backendApiClient';
import { RetrievalResults } from './RetrievalResults';
interface Props {
  options: RetrievalOptions;
  onChange: (options: RetrievalOptions) => void;
  onPreview: (target: PreviewTarget) => void;
  onAsk: () => void;
}
export function SearchWorkspace({ options, onChange, onPreview, onAsk }: Props) {
  const [result, setResult] = useState<RetrievalResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function search() {
    if (!options.query.trim()) return;
    setLoading(true);
    setError('');
    try {
      setResult(await postBackend<RetrievalResult>('/search', options));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="query-bar">
        <SearchOutlined aria-hidden="true" />
        <Input
          aria-label="Search documents"
          placeholder="Find an idea, a passage, or an exact detail…"
          value={options.query}
          onChange={(event) => onChange({ ...options, query: event.target.value })}
          onPressEnter={() => void search()}
          variant="borderless"
        />
        <Button
          type="primary"
          loading={loading}
          disabled={!options.query.trim()}
          onClick={() => void search()}
        >
          Search
        </Button>
      </div>
      {error && <Alert type="error" title={error} showIcon />}
      {result ? (
        <>
          <div className="section-heading">
            <div>
              <h3>Search results</h3>
              <span className="muted">{result.query}</span>
            </div>
            <Button icon={<ArrowRightOutlined aria-hidden="true" />} onClick={onAsk}>
              Ask about this
            </Button>
          </div>
          <RetrievalResults result={result} onPreview={onPreview} />
        </>
      ) : (
        <div className="workspace-empty">
          <div className="empty-icon">
            <SearchOutlined aria-hidden="true" />
          </div>
          <h2>Find the passage that matters</h2>
          <p>
            Search your library by meaning, keywords, or both.
            <br />
            Inspect every match and see exactly what the model receives.
          </p>
          <Space wrap>
            <span className="hint-pill">Scope by folder</span>
            <span className="hint-pill">Compare retrieval modes</span>
            <span className="hint-pill">Trace every source</span>
          </Space>
        </div>
      )}
    </>
  );
}
