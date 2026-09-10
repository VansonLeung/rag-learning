import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Typography,
  App,
} from 'antd';
import { ApiOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { requestBackend, postBackend } from '../../api/backendApiClient';
import type { ApplicationSettings } from '../../types/applicationTypes';
interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onReindexAll: () => void;
  documentCount: number;
}
export function ModelSettingsDrawer({
  open,
  onClose,
  onSaved,
  onReindexAll,
  documentCount,
}: Props) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState('');
  const [changed, setChanged] = useState(false);
  const [activeRole, setActiveRole] = useState('embedding');
  useEffect(() => {
    if (open) {
      setLoading(true);
      requestBackend<ApplicationSettings>('/settings')
        .then((data) => {
          form.setFieldsValue(data);
          setChanged(false);
        })
        .catch((error) => message.error(error.message))
        .finally(() => setLoading(false));
    }
  }, [open, form, message]);
  async function saveSettings() {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const result = await requestBackend<{
        requiresReindex: boolean;
        settings: ApplicationSettings;
      }>('/settings', { method: 'PUT', body: JSON.stringify(values) });
      form.setFieldsValue(result.settings);
      setChanged(false);
      onSaved();
      message.success(
        result.requiresReindex
          ? 'Settings saved. Existing documents need reindexing.'
          : 'Settings saved',
      );
      return true;
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }
  async function testConnection(role: string) {
    setTesting(role);
    try {
      if (!(await saveSettings())) return;
      const result = await postBackend<{ details: string; durationMs: number }>(
        `/settings/test/${role}`,
      );
      message.success(`${result.details} · ${result.durationMs} ms`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setTesting('');
    }
  }
  return (
    <Drawer
      title={
        <Space>
          <ApiOutlined aria-hidden="true" />
          Model connections
        </Space>
      }
      open={open}
      onClose={onClose}
      size={560}
      extra={
        <Button type="primary" loading={loading} onClick={() => void saveSettings()}>
          Save settings
        </Button>
      }
    >
      <p className="muted">
        Connect your own models. Requests and API keys stay on the backend; document content is sent
        to the endpoints you configure.
      </p>
      <Alert
        type="info"
        showIcon
        title="Use an API base URL"
        description="Include /v1 when your provider requires it. Embeddings and chat/completions are appended automatically. Reranking uses the path you specify."
      />
      <Form form={form} layout="vertical" onValuesChange={() => setChanged(true)} preserve>
        <Tabs
          activeKey={activeRole}
          onChange={setActiveRole}
          items={['embedding', 'reranker', 'llm'].map((role) => ({
            key: role,
            label:
              role === 'llm' ? 'Generation' : role === 'embedding' ? 'Embeddings' : 'Reranking',
            forceRender: true,
            children: (
              <>
                <Form.Item
                  name={[role, 'baseUrl']}
                  label="API base URL"
                  rules={[
                    {
                      validator: (_, value) =>
                        !value || /^https?:\/\//.test(value)
                          ? Promise.resolve()
                          : Promise.reject('Enter an http(s) URL'),
                    },
                  ]}
                >
                  <Input placeholder="http://localhost:8080/v1" />
                </Form.Item>
                <Form.Item name={[role, 'model']} label="Model name">
                  <Input
                    placeholder={
                      role === 'embedding'
                        ? 'Your embedding model'
                        : role === 'reranker'
                          ? 'Your reranking model'
                          : 'Your chat model'
                    }
                  />
                </Form.Item>
                <Form.Item
                  name={[role, 'apiKey']}
                  label="API key"
                  extra="Leave blank to keep a saved key. Local providers can work without one."
                >
                  <Input.Password
                    autoComplete="new-password"
                    placeholder="Optional · stored only on this machine"
                  />
                </Form.Item>
                <Form.Item name={[role, 'hasApiKey']} hidden>
                  <Input />
                </Form.Item>
                <Button
                  size="small"
                  onClick={() => {
                    form.setFieldValue([role, 'hasApiKey'], false);
                    form.setFieldValue([role, 'apiKey'], '');
                    setChanged(true);
                  }}
                >
                  Clear saved key
                </Button>
                <Form.Item
                  name={[role, 'timeoutMs']}
                  label="Request timeout (milliseconds)"
                  style={{ marginTop: 20 }}
                >
                  <InputNumber min={1000} max={300000} step={1000} style={{ width: '100%' }} />
                </Form.Item>
                {role === 'embedding' && (
                  <Form.Item
                    name={[role, 'dimensions']}
                    label="Embedding dimensions"
                    extra="Leave empty to use the model default. Changing the model, URL, or dimensions requires reindexing."
                  >
                    <InputNumber
                      min={1}
                      max={16000}
                      placeholder="Model default"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                )}
                {role === 'reranker' && (
                  <>
                    <Form.Item name={[role, 'format']} label="API format">
                      <Select
                        options={[
                          {
                            value: 'cohere',
                            label: 'Cohere-compatible · documents / relevance_score',
                          },
                          { value: 'tei', label: 'Hugging Face TEI · texts / score' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name={[role, 'path']} label="Rerank path">
                      <Input placeholder="/rerank" />
                    </Form.Item>
                  </>
                )}
                <Button
                  icon={<CheckCircleOutlined aria-hidden="true" />}
                  loading={testing === role}
                  onClick={() => void testConnection(role)}
                >
                  Save & test connection
                </Button>
              </>
            ),
          }))}
        />
      </Form>
      <div className="settings-footer">
        <Typography.Title level={5}>Index maintenance</Typography.Title>
        <p className="muted">
          Build both normal chunks and parent-child chunks for every file. Reindexing retains the
          previous index until the new one is ready.
        </p>
        <Button disabled={!documentCount || changed} onClick={onReindexAll}>
          Reindex all {documentCount} documents
        </Button>
        {changed && <p className="muted">Save changes before reindexing.</p>}
      </div>
    </Drawer>
  );
}
