import { useState } from 'react';
import { Alert, Button, Checkbox, Input, Tag } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import type { RetrievalOptions, RetrievalResult } from '../../types/applicationTypes';
import type { PreviewTarget } from '../explorer/DocumentPreviewDrawer';
import { postBackend } from '../../api/backendApiClient';
import { RetrievalResults } from './RetrievalResults';
import { CitedMarkdownAnswer } from '../chat/CitedMarkdownAnswer';
interface Variant {
  method: string;
  strategy: string;
  retrieval?: RetrievalResult;
  answer?: string;
  error?: string;
  answerDurationMs?: number;
}
export function RetrievalComparisonWorkspace({
  options,
  onChange,
  onPreview,
}: {
  options: RetrievalOptions;
  onChange: (options: RetrievalOptions) => void;
  onPreview: (target: PreviewTarget) => void;
}) {
  const [results, setResults] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateAnswers, setGenerateAnswers] = useState(false);
  const [error, setError] = useState('');
  async function compare() {
    if (!options.query.trim()) return;
    setLoading(true);
    setError('');
    try {
      setResults(
        (await postBackend<{ results: Variant[] }>('/compare', { ...options, generateAnswers }))
          .results,
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="query-bar">
        <ExperimentOutlined aria-hidden="true" />
        <Input
          aria-label="Comparison query"
          variant="borderless"
          value={options.query}
          onChange={(event) => onChange({ ...options, query: event.target.value })}
          onPressEnter={() => void compare()}
          placeholder="One question. Four ways to retrieve the answer."
        />
        <Button
          type="primary"
          loading={loading}
          disabled={!options.query.trim()}
          onClick={() => void compare()}
        >
          Compare four modes
        </Button>
      </div>
      <div className="comparison-note">
        <Checkbox
          checked={generateAnswers}
          onChange={(event) => setGenerateAnswers(event.target.checked)}
        >
          Generate an answer for each mode
        </Checkbox>
        <p className="muted">
          Uses the same scope, reranker, counts, and context budget. Runs vector / hybrid × normal /
          parent-child sequentially. Enabling answers makes four LLM calls.
        </p>
      </div>
      {error && <Alert type="error" title={error} />}
      <div className="comparison-grid">
        {results.map((result) => (
          <section className="comparison-card" key={result.method + result.strategy}>
            <div className="section-heading">
              <h3>{result.method === 'vector' ? 'Vector' : 'Hybrid'}</h3>
              <Tag>{result.strategy}</Tag>
            </div>
            {result.error ? (
              <Alert type="error" title={result.error} />
            ) : (
              result.retrieval && (
                <>
                  {result.answer && (
                    <div className="comparison-answer">
                      <CitedMarkdownAnswer
                        content={result.answer}
                        passages={result.retrieval.passages}
                        onPreview={onPreview}
                      />
                      <span className="muted">
                        Answer: {Math.round(result.answerDurationMs ?? 0)} ms
                      </span>
                    </div>
                  )}
                  <RetrievalResults result={result.retrieval} onPreview={onPreview} compact />
                </>
              )
            )}
          </section>
        ))}
      </div>
      {!results.length && (
        <div className="workspace-empty">
          <div className="empty-icon">
            <ExperimentOutlined aria-hidden="true" />
          </div>
          <h2>See what changes the answer</h2>
          <p>
            Compare the evidence, context, and speed of every retrieval mode.
            <br />
            Turn on answers to evaluate the complete RAG pipeline.
          </p>
        </div>
      )}
    </>
  );
}
