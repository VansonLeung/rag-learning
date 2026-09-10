import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Input, Select, Space, Tag } from 'antd';
import { ArrowUpOutlined, CommentOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useWorkspaceApi } from '../../api/WorkspaceApiProvider';
import type { RetrievalOptions, RetrievalResult } from '../../types/applicationTypes';
import type { PreviewTarget } from '../explorer/DocumentPreviewDrawer';
import { CitedMarkdownAnswer } from './CitedMarkdownAnswer';
import { RetrievalResults } from '../search/RetrievalResults';
interface Message {
  role: 'user' | 'assistant';
  content: string;
  retrieval?: RetrievalResult;
  interrupted?: boolean;
}
export function ChatWorkspace({
  options,
  onPreview,
}: {
  options: RetrievalOptions;
  onPreview: (target: PreviewTarget) => void;
}) {
  const { requestBackend, streamBackendEvents, urlFor } = useWorkspaceApi();
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState(options.query);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const refreshSessions = () =>
    requestBackend<typeof sessions>('/chat/sessions')
      .then(setSessions)
      .catch((error) => setError(error.message));
  useEffect(() => {
    void refreshSessions();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);
  async function loadSession(id: string) {
    setError('');
    setLoading(true);
    try {
      const saved = await requestBackend<Message[]>(`/chat/sessions/${id}`);
      setSessionId(id);
      setMessages(saved);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function askQuestion() {
    if (!question.trim() || loading) return;
    const query = question.trim();
    setQuestion('');
    setError('');
    setLoading(true);
    controller.current = new AbortController();
    setMessages((previous) => [
      ...previous,
      { role: 'user', content: query },
      { role: 'assistant', content: '' },
    ]);
    try {
      await streamBackendEvents(
        '/chat',
        { sessionId, options: { ...options, query } },
        (type, payload) => {
          if (type === 'session') setSessionId(payload.id);
          if (type === 'retrieval')
            setMessages((previous) =>
              previous.map((message, index) =>
                index === previous.length - 1 ? { ...message, retrieval: payload } : message,
              ),
            );
          if (type === 'token')
            setMessages((previous) =>
              previous.map((message, index) =>
                index === previous.length - 1
                  ? { ...message, content: message.content + payload }
                  : message,
              ),
            );
        },
        controller.current.signal,
      );
    } catch (error) {
      const stopped = controller.current.signal.aborted;
      setError(
        stopped
          ? 'Response stopped. The incomplete exchange was not saved.'
          : (error as Error).message,
      );
      setMessages((previous) =>
        previous.map((message, index) =>
          index === previous.length - 1 ? { ...message, interrupted: true } : message,
        ),
      );
      setQuestion(query);
    } finally {
      setLoading(false);
      controller.current = null;
      void refreshSessions();
    }
  }
  return (
    <div className="chat-workspace">
      <div className="flex-between chat-toolbar">
        <Space>
          <CommentOutlined aria-hidden="true" />
          <Select
            aria-label="Conversation history"
            placeholder="New conversation"
            value={sessionId}
            disabled={loading}
            style={{ width: 270 }}
            options={sessions.map((session) => ({ value: session.id, label: session.title }))}
            onChange={(id) => void loadSession(id)}
          />
        </Space>
        <Button
          icon={<PlusOutlined aria-hidden="true" />}
          disabled={loading}
          onClick={() => {
            setSessionId(undefined);
            setMessages([]);
            setError('');
          }}
        >
          New chat
        </Button>
      </div>
      <div className="chat-messages">
        {!messages.length && (
          <div className="workspace-empty">
            <div className="empty-icon">
              <CommentOutlined aria-hidden="true" />
            </div>
            <h2>A conversation with your library</h2>
            <p>
              Ask a question and follow the citations back to your documents.
              <br />
              The current search scope applies to every new question.
            </p>
            <p className="muted">
              Use explicit subjects in follow-up questions for the best retrieval.
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <article key={index} className={`chat-message ${message.role}`}>
            <div className="chat-role">
              {message.role === 'user' ? 'You' : 'Grove'}
              {message.interrupted && <Tag color="orange">Incomplete · not saved</Tag>}
            </div>
            {message.role === 'user' ? (
              <p>{message.content}</p>
            ) : (
              <>
                <CitedMarkdownAnswer
                  content={
                    message.content ||
                    (loading ? 'Finding evidence in your sources…' : 'No answer received.')
                  }
                  passages={message.retrieval?.passages ?? []}
                  onPreview={onPreview}
                />
                {message.retrieval && (
                  <Collapse
                    ghost
                    items={[
                      {
                        key: 'evidence',
                        label: `Inspect evidence · ${message.retrieval.passages.length} sources`,
                        children: (
                          <RetrievalResults
                            result={message.retrieval}
                            onPreview={onPreview}
                            compact
                          />
                        ),
                      },
                    ]}
                  />
                )}
              </>
            )}
          </article>
        ))}
        <div ref={end} />
      </div>
      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError('')} />}
      <div className="chat-composer">
        <Input.TextArea
          aria-label="Ask your documents"
          placeholder="Ask your documents a question…"
          value={question}
          autoSize={{ minRows: 2, maxRows: 5 }}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void askQuestion();
            }
          }}
        />
        <div className="flex-between">
          <span className="muted">Enter to send · Shift + Enter for a new line</span>
          {loading ? (
            <Button
              icon={<StopOutlined aria-hidden="true" />}
              onClick={() => controller.current?.abort()}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<ArrowUpOutlined aria-hidden="true" />}
              disabled={!question.trim()}
              onClick={() => void askQuestion()}
            >
              Ask Grove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
