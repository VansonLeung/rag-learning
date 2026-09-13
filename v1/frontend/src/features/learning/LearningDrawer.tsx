import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Select, Space, Spin, Tabs, Tag } from 'antd';
import {
  ExportOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useWorkspaceApi } from '../../api/WorkspaceApiProvider';
import type { LearningCatalog, LearningSession, LearningSessionSummary } from './learningTypes';
import { FunctionGraph } from './FunctionGraph';

export function LearningDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { requestBackend, postBackend } = useWorkspaceApi();
  const [catalog, setCatalog] = useState<LearningCatalog>();
  const [sessions, setSessions] = useState<LearningSessionSummary[]>([]);
  const [session, setSession] = useState<LearningSession>();
  const selectedId = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState('practice');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    void (async () => {
      try {
        const [nextCatalog, history] = await Promise.all([
          requestBackend<LearningCatalog>('/learning/catalog'),
          requestBackend<LearningSessionSummary[]>('/learning/sessions'),
        ]);
        const id = selectedId.current || history[0]?.id;
        const current = id
          ? await requestBackend<LearningSession>(`/learning/sessions/${id}`)
          : undefined;
        if (!cancelled) {
          setCatalog(nextCatalog);
          setSessions(history);
          setSession(current);
          selectedId.current = current?.id;
        }
      } catch (error) {
        if (!cancelled) setError((error as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, requestBackend, reload]);

  async function selectSession(id?: string) {
    setBusy(true);
    setError('');
    try {
      const current = id
        ? await requestBackend<LearningSession>(`/learning/sessions/${id}`)
        : await postBackend<LearningSession>('/learning/sessions', {});
      setSession(current);
      selectedId.current = current.id;
      setHintOpen(false);
      setSessions(await requestBackend<LearningSessionSummary[]>('/learning/sessions'));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(responses: Record<string, string>, submit = false) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      const current = await requestBackend<LearningSession>(
        `/learning/sessions/${session.id}/${submit ? 'submit' : 'draft'}`,
        {
          method: 'PUT',
          body: JSON.stringify({ version: session.version, responses }),
        },
      );
      setSession(current);
      if (submit) setSessions(await requestBackend<LearningSessionSummary[]>('/learning/sessions'));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const resources =
    catalog?.resources.filter((resource) =>
      `${resource.title} ${resource.description} ${resource.curriculumMappings.map((mapping) => `${mapping.unitCode} ${mapping.title}`).join(' ')}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <Drawer
      title="Maths practice"
      open={open}
      onClose={() => !busy && onClose()}
      size={fullscreen ? '100vw' : 1000}
      className="learning-drawer"
      extra={
        <Button
          type="text"
          aria-label={fullscreen ? 'Exit fullscreen practice' : 'Expand practice to fullscreen'}
          icon={
            fullscreen ? <FullscreenExitOutlined aria-hidden /> : <FullscreenOutlined aria-hidden />
          }
          onClick={() => setFullscreen(!fullscreen)}
        />
      }
      footer={
        tab === 'practice' && session ? (
          <div className="practice-footer">
            <span role="status" aria-label="Exercise save status">
              {busy
                ? 'Saving…'
                : error
                  ? 'Reload to continue'
                  : session.feedback
                    ? `Checked · ${session.feedback.score}/${session.feedback.total} correct`
                    : 'Answers saved in this workspace'}
            </span>
            <Space wrap>
              <Button onClick={() => setHintOpen(!hintOpen)} aria-expanded={hintOpen}>
                {' '}
                {hintOpen ? 'Hide hint' : 'Hint'}{' '}
              </Button>
              <Button
                type="primary"
                loading={busy}
                disabled={
                  !!session.feedback ||
                  Object.keys(session.responses).length !== session.exercise.graphs.length
                }
                onClick={() => void save(session.responses, true)}
              >
                Check answers
              </Button>
            </Space>
          </div>
        ) : null
      }
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'practice', label: 'Practice' },
          { key: 'resources', label: 'Linked resources' },
        ]}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" disabled={busy} onClick={() => setReload((value) => value + 1)}>
              Reload
            </Button>
          }
        />
      )}
      {!catalog ? (
        busy ? (
          <Spin />
        ) : null
      ) : tab === 'resources' ? (
        <>
          <p className="muted">
            External learning resources. Their lesson contents are not indexed in Grove.
          </p>
          <Input.Search
            aria-label="Find linked resources"
            placeholder="Find a resource or curriculum unit…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            allowClear
          />
          <div className="linked-resources">
            {resources.map((resource) => (
              <article className="linked-resource" key={resource.id}>
                <div className="flex-between">
                  <h3>{resource.title}</h3>
                  <Button
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<ExportOutlined aria-hidden />}
                    aria-label={`Open ${resource.title}`}
                  >
                    Open site
                  </Button>
                </div>
                <p>{resource.description}</p>
                <div className="resource-metadata">
                  <span>{resource.publisher}</span>
                  {resource.curriculumMappings.map((mapping) => (
                    <Tag key={mapping.unitCode}>{mapping.unitCode} · Candidate mapping</Tag>
                  ))}
                  <span>Inspected {resource.verifiedAt}</span>
                  <a href={resource.noticeUrl} target="_blank" rel="noopener noreferrer">
                    Source terms
                  </a>
                </div>
              </article>
            ))}
            {!resources.length && <Empty description="No matching resources" />}
          </div>
        </>
      ) : (
        <>
          <div className="practice-toolbar">
            <Select
              aria-label="Saved exercise sets"
              placeholder="Saved exercise sets"
              value={session?.id}
              disabled={busy}
              onChange={(id) => void selectSession(id)}
              options={sessions.map((item) => ({
                value: item.id,
                label: `${new Date(item.created_at).toLocaleString()} · ${item.submitted_at ? `${item.score}/4 correct` : 'In progress'}`,
              }))}
            />
            <Button
              icon={<PlusOutlined aria-hidden />}
              disabled={busy}
              onClick={() => void selectSession()}
            >
              New set
            </Button>
          </div>
          {!session ? (
            <div className="practice-start">
              <h2>{catalog.exercise.title}</h2>
              <p>{catalog.exercise.description}</p>
              <p className="muted">
                {catalog.exercise.curriculum} · {catalog.exercise.provenance}
              </p>
              <p className="muted">
                Built-in practice with automatic checking. No model connection needed.
              </p>
              <Button type="primary" loading={busy} onClick={() => void selectSession()}>
                Start practice
              </Button>
            </div>
          ) : session.exercise.viewType !== 'function_graph_matching' ? (
            <Alert
              type="warning"
              title="This exercise view is not supported by this version of Grove."
            />
          ) : (
            <>
              <div className="practice-instructions">
                <p>{session.exercise.instructions}</p>
                <span className="muted">
                  {session.exercise.provenance} · Automatically generated from a fixed template
                </span>
                <p className="muted">{session.exercise.domainNote}</p>
              </div>
              {hintOpen && <Alert type="info" showIcon title={session.exercise.hint} />}
              {session.feedback && (
                <Alert
                  type={session.feedback.score === session.feedback.total ? 'success' : 'info'}
                  showIcon
                  title={`${session.feedback.score} of ${session.feedback.total} correct`}
                  description="Your attempt is saved. Review the explanations or start a new set."
                />
              )}
              <div className="exercise-graph-grid">
                {session.exercise.graphs.map((graph) => {
                  const feedback = session.feedback?.parts[graph.id];
                  return (
                    <article className="exercise-graph-card" key={`${session.id}-${graph.id}`}>
                      <div className="flex-between">
                        <h3>Graph {graph.label}</h3>
                        {feedback && (
                          <Tag color={feedback.correct ? 'green' : 'orange'}>
                            {feedback.correct ? 'Correct' : 'Review'}
                          </Tag>
                        )}
                      </div>
                      <FunctionGraph spec={graph.spec} label={graph.label} />
                      <Select
                        aria-label={`Equation for graph ${graph.label}`}
                        className="graph-answer"
                        placeholder="Choose an equation"
                        value={session.responses[graph.id]}
                        allowClear
                        disabled={busy || !!session.feedback}
                        onChange={(value) => {
                          const responses = { ...session.responses };
                          if (value) responses[graph.id] = value;
                          else delete responses[graph.id];
                          void save(responses);
                        }}
                        options={session.exercise.choices.map((choice) => ({
                          value: choice.id,
                          label: choice.label,
                          disabled: Object.entries(session.responses).some(
                            ([id, value]) => id !== graph.id && value === choice.id,
                          ),
                        }))}
                      />
                      {feedback && (
                        <div className="graph-feedback">
                          <strong>
                            {
                              session.exercise.choices.find(
                                (choice) => choice.id === feedback.choiceId,
                              )?.label
                            }
                          </strong>
                          <p>{feedback.explanation}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
