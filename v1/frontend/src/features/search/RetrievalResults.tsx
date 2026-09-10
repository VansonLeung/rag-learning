import { Alert, Button, Collapse, Empty, Space, Table, Tabs, Tag } from 'antd';
import { ExportOutlined, FileTextOutlined } from '@ant-design/icons';
import type { RetrievalResult } from '../../types/applicationTypes';
import type { PreviewTarget } from '../explorer/DocumentPreviewDrawer';
export function RetrievalResults({
  result,
  onPreview,
  compact = false,
}: {
  result: RetrievalResult;
  onPreview: (target: PreviewTarget) => void;
  compact?: boolean;
}) {
  return (
    <div className="retrieval-results">
      {result.warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon title={warning} style={{ marginBottom: 12 }} />
      ))}
      <div className="result-summary">
        <span>
          <strong>{result.matches.length}</strong> matches ·{' '}
          <strong>{result.passages.length}</strong> context passages
        </span>
        <span>
          {Math.round(result.timings.total)} ms · {result.contextTokenCount.toLocaleString()} tokens
        </span>
      </div>
      {!result.matches.length ? (
        <Empty description="No results in this scope. Index documents or broaden the scope." />
      ) : (
        <Tabs
          items={[
            {
              key: 'matches',
              label: 'Retrieved evidence',
              children: result.matches.map((match, index) => (
                <article className="result-card" key={match.id}>
                  <div className="flex-between">
                    <span className="result-path">
                      <FileTextOutlined aria-hidden="true" /> {match.path}
                    </span>
                    <Tag>#{index + 1}</Tag>
                  </div>
                  <p className="result-excerpt">
                    {compact ? match.content.slice(0, 250) + '…' : match.content}
                  </p>
                  <div className="flex-between">
                    <Space wrap size={6}>
                      {match.vectorScore !== undefined && (
                        <span className="score-chip">Vector {match.vectorScore.toFixed(3)}</span>
                      )}
                      {match.keywordScore !== undefined && (
                        <span className="score-chip">Keyword {match.keywordScore.toFixed(3)}</span>
                      )}
                      {match.fusionScore !== undefined && (
                        <span className="score-chip">RRF {match.fusionScore.toFixed(4)}</span>
                      )}
                      {match.rerankerScore !== undefined && (
                        <span className="score-chip">Rerank {match.rerankerScore.toFixed(3)}</span>
                      )}
                    </Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<ExportOutlined aria-hidden="true" />}
                      onClick={() =>
                        onPreview({
                          documentId: match.document_id,
                          startOffset: match.start_offset,
                          endOffset: match.end_offset,
                        })
                      }
                    >
                      Source
                    </Button>
                  </div>
                </article>
              )),
            },
            {
              key: 'context',
              label: 'LLM context',
              children: (
                <>
                  <p className="muted">
                    Exact source context sent to the answer model. Parent passages are deduplicated,
                    then fitted to the token budget.
                  </p>
                  {result.passages.map((passage) => (
                    <div className="context-source" key={passage.citation}>
                      <Button
                        type="link"
                        onClick={() =>
                          onPreview({
                            documentId: passage.documentId,
                            startOffset: passage.startOffset,
                            endOffset: passage.endOffset,
                          })
                        }
                      >
                        [{passage.citation}] {passage.path}
                      </Button>
                      {passage.truncated && <Tag color="orange">Truncated</Tag>}
                    </div>
                  ))}
                  <pre className="context-text">{result.context}</pre>
                </>
              ),
            },
            {
              key: 'inspector',
              label: 'Inspector',
              children: (
                <>
                  <Space wrap>
                    {Object.entries(result.timings).map(([key, time]) => (
                      <Tag key={key}>
                        {key}: {Math.round(time)} ms
                      </Tag>
                    ))}
                  </Space>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 650 }}
                    dataSource={result.candidates}
                    columns={[
                      { title: 'Final rank', render: (_, __, index) => index + 1 },
                      { title: 'Before rerank', dataIndex: 'rankBeforeRerank' },
                      { title: 'Source', dataIndex: 'path', ellipsis: true },
                      {
                        title: 'Vector',
                        dataIndex: 'vectorScore',
                        render: (value) => value?.toFixed(4) ?? '—',
                      },
                      {
                        title: 'Keyword',
                        dataIndex: 'keywordScore',
                        render: (value) => value?.toFixed(4) ?? '—',
                      },
                      {
                        title: 'RRF',
                        dataIndex: 'fusionScore',
                        render: (value) => value?.toFixed(4) ?? '—',
                      },
                      {
                        title: 'Rerank',
                        dataIndex: 'rerankerScore',
                        render: (value) => value?.toFixed(4) ?? '—',
                      },
                    ]}
                  />
                  <Collapse
                    items={[
                      {
                        key: 'options',
                        label: 'Query configuration',
                        children: <pre>{JSON.stringify(result.options, null, 2)}</pre>,
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
