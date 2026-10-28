export interface ModelEndpointSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}
export interface ApplicationSettings {
  embedding: ModelEndpointSettings & { dimensions?: number };
  reranker: ModelEndpointSettings & { format: 'tei' | 'cohere'; path: string };
  llm: ModelEndpointSettings;
}
export interface ExplorerNode {
  id: string;
  parent_id: string | null;
  name: string;
  kind: 'folder' | 'file';
  mime_type: string | null;
  size: number;
  content_hash: string | null;
  extracted_text: string | null;
  index_fingerprint: string | null;
  indexed_at: string | null;
  created_at: string;
  path?: string;
  status?: string;
}
export interface IndexingJob {
  id: string;
  document_id: string;
  document_name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  created_at: string;
}
export interface RetrievalOptions {
  query: string;
  method: 'vector' | 'hybrid';
  strategy: 'normal' | 'parent-child';
  scope: 'all' | 'folder' | 'subtree' | 'files';
  folderId: string;
  fileIds: string[];
  rerank: boolean;
  candidateCount: number;
  resultCount: number;
  contextTokens: number;
}
export interface RetrievedChunk {
  id: string;
  document_id: string;
  parent_chunk_id: string | null;
  kind: string;
  content: string;
  start_offset: number;
  end_offset: number;
  path: string;
  vectorScore?: number;
  keywordScore?: number;
  fusionScore?: number;
  rerankerScore?: number;
  rankBeforeRerank?: number;
}
export interface ContextPassage {
  citation: number;
  chunkId: string;
  documentId: string;
  path: string;
  content: string;
  startOffset: number;
  endOffset: number;
  truncated: boolean;
}
export interface RetrievalResult {
  query: string;
  options: RetrievalOptions;
  candidates: RetrievedChunk[];
  matches: RetrievedChunk[];
  passages: ContextPassage[];
  context: string;
  timings: Record<string, number>;
  warnings: string[];
  contextTokenCount: number;
}
