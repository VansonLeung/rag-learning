# Grove — RAG learning explorer

A local, single-user RAG workspace with a file explorer, scoped retrieval, cited chat, and a retrieval comparison lab. Built with Node, Express, PGlite + pgvector, Vite, React, Ant Design, and TypeScript.

## Run

Requires Node.js 22.13+ (Node 24 recommended) and npm.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The backend listens on port 3001. For a production build served entirely by Express:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. There is no database server or Docker requirement. Only one backend process should use a data directory at a time.

## Connect your models

Open **Model connections**. Each role has its own API base URL, model, optional key, timeout, and **Save & test connection** button. Local endpoints can use blank keys. Include `/v1` in the base URL if your provider requires it; do not include the final operation path.

| Role                        | Request                                                                                     | Expected response                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Embeddings                  | `POST {baseUrl}/embeddings`, `{ model, input: string[], dimensions? }`                      | `{ data: [{ index, embedding: number[] }] }`                                                      |
| Generation                  | `POST {baseUrl}/chat/completions`, `{ model, messages, stream: true }`                      | SSE `data:` events containing `choices[0].delta.content`, followed by a finish reason or `[DONE]` |
| Cohere-compatible reranking | `POST {baseUrl}{configuredPath}`, `{ model, query, documents, top_n }`                      | `{ results: [{ index, relevance_score }] }`                                                       |
| Hugging Face TEI reranking  | `POST {baseUrl}{configuredPath}`, `{ query, texts, raw_scores: false, return_text: false }` | `[{ index, score }]`                                                                              |

The rerank path defaults to `/rerank`; use `/v1/rerank` when appropriate for a base URL without `/v1`. Reranking is optional. Providers must return a score for every submitted candidate. Connection tests save the current settings and call the configured provider.

API keys are stored in the local database, inside a data directory created with owner-only permissions. They are redacted from settings responses and kept out of frontend storage. The database is not encrypted. The backend sends source content to the model endpoints you configure. Changing the embedding base URL, model, or dimensions marks existing indexes stale and excludes them from search until reindexed. A model change behind an unchanged endpoint/name also needs a manual reindex.

## Use the workspace

1. Create folders; upload files or upload a folder to preserve its relative paths. Accepted files: UTF-8 TXT, Markdown, text-based PDF, and DOCX, up to 25 MB each and 5 million extracted characters. Identical content in the same folder is skipped. A different file using an existing name is rejected rather than overwritten.
2. Open **Indexing activity** to see extraction/embedding progress, cancel a job, or retry it. Without a configured embedding model, extraction still provides a text preview and the job reports the missing configuration. Configure a model and retry.
3. In **Search**, choose all documents, the current folder, the current folder plus descendants, or selected files. File checkboxes select search scope; folder clicks navigate. Scope filtering happens before ranking and limits both vector and keyword retrieval.
4. Switch between **vector** and **hybrid** retrieval independently of **normal** and **parent-child** context. Tune candidate count, final matches, reranking, and context tokens. The inspector exposes scores, timings, ranking changes, and the exact source context sent to the LLM.
5. **Ask your library** streams answers and links numbered citations to highlighted source passages. Completed conversations persist. Stopped or failed exchanges remain visibly incomplete in the current view and are not saved. Prior turns inform generation; retrieval uses the current question, so explicit subjects help with follow-ups.
6. **Compare** runs all four retrieval combinations with the same scope and tuning. Optionally generate four answers. Timings include separate embedding, retrieval, reranking, and answer times; results are not a controlled model-quality benchmark.

Rename and move actions preserve indexes. Folder moves update search scope immediately. Delete removes descendants and their indexes. Reindex swaps a document's complete index in one transaction only after all embeddings succeed; failure or cancellation retains its previous index. Jobs are persisted, and interrupted running jobs are queued again on startup.

## Retrieval details

- **Vector:** exact cosine distance search in pgvector. Exact search favors correctness and straightforward dimensionality changes for a small local corpus. This version does not create an approximate HNSW index.
- **Hybrid:** PostgreSQL full-text search (`simple` tokenizer, `websearch_to_tsquery`, `ts_rank_cd`) plus vector search, combined with reciprocal rank fusion, `1 / (60 + rank)`. This is PostgreSQL full-text ranking, not BM25. Chinese keyword segmentation is limited; vector language support depends on the embedding model.
- **Normal:** approximately 1,600-character chunks with 200-character overlap.
- **Parent-child:** approximately 4,800-character parents, with 650-character children and 100-character child overlap. Boundaries prefer nearby paragraph/sentence endings. Both indexes are built at ingestion so switching strategy does not require reindexing. Parent chunks are not embedded.
- Child matches expand to parent passages after ranking/reranking and final-match selection. Duplicate parents are removed. The last passage may be truncated to fit the context budget. Source offsets remain traceable to extracted text.
- The context budget uses `cl100k_base` and covers source labels and passages. The system prompt, current question, bounded conversation history, and output need additional model capacity. Token counts may differ for your provider's tokenizer.
- Vector similarity always returns nearest matches when an index is available; scores are not confidence probabilities. The generation instruction requires an insufficient-evidence answer when sources do not support a claim. Citation grounding still depends on the configured model.

## Code layout

```text
v1/backend/src/
  config/                 Paths and request validation
  database/migrations/    Persistent PostgreSQL schema
  repositories/           Settings and explorer persistence
  models/                 Embedding, reranking, and streaming chat adapters
  services/ingestion/     Uploads, extraction, chunking, durable indexing jobs
  services/retrieval/     Scope filtering, rank fusion, context, grounded answers
  events/                 Change listener subscription and publication
  controllers/            Chat streaming lifecycle
  routes/                 HTTP API composition
v1/frontend/src/
  api/                    JSON and streaming API clients
  hooks/                  Library/job event subscriptions
  features/explorer/      Folder tree, file table, source preview
  features/search/        Controls, evidence inspector, comparison
  features/chat/          Conversations and citation rendering
  features/settings/      Model configuration and connection tests
  features/jobs/          Progress, retry, and cancellation
```

Indexing publishes events through a small event bus; the frontend subscribes over Server-Sent Events with reconnection and refresh. Components use explicit callbacks for navigation, previews, and actions. SQL values are parameterized. Backend routes validate requests. Model calls have deadlines and cancellation signals.

## Data and configuration

Data defaults to **`v1/backend/.data`**, with the embedded database under `postgres/` and original files under `uploads/`. Set `RAG_DATA_DIR` to an absolute directory to relocate it. Set `PORT` to change the production backend port; update the Vite proxy if changing the development port. The service binds to `127.0.0.1` and has no account or access-control system.

Stop the backend before backing up the entire data directory. Keep `postgres/` and `uploads/` together. Browser test data uses temporary directories and never touches your library.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium  # once, if not already installed
npm run test:browser
npm run format:check
```

Integration tests use a real temporary PGlite database and local deterministic model fixtures, covering scope isolation, rank fusion, parent expansion, citations, index changes, cancellations, folder operations, and Unicode offsets. Browser tests configure model endpoints, upload a document, search, open citations, compare all modes, and check mobile layout. They use ports 3001 and 3002, so stop your development server first.

Live model quality and provider-specific behavior require your actual endpoints. OCR, filesystem watching, semantic folder-summary traversal, multi-user authorization, and production-scale indexing are outside this local v1.
