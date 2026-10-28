export const initialApplicationSchema = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS application_settings(id integer PRIMARY KEY CHECK (id = 1), value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS explorer_nodes(
 id text PRIMARY KEY, parent_id text REFERENCES explorer_nodes(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK (kind IN ('folder','file')),
 mime_type text, size integer NOT NULL DEFAULT 0, content_hash text, extracted_text text,
 index_fingerprint text, indexed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(parent_id, name)
);
INSERT INTO explorer_nodes(id, name, kind) VALUES ('root','Knowledge library','folder') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS document_chunks(
 id text PRIMARY KEY, document_id text NOT NULL REFERENCES explorer_nodes(id) ON DELETE CASCADE,
 parent_chunk_id text REFERENCES document_chunks(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('normal','child','parent')), content text NOT NULL,
 start_offset integer NOT NULL, end_offset integer NOT NULL,
 embedding vector, index_fingerprint text NOT NULL,
 search_tokens tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);
CREATE INDEX IF NOT EXISTS document_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS document_chunks_keywords ON document_chunks USING gin(search_tokens);
CREATE INDEX IF NOT EXISTS explorer_nodes_parent ON explorer_nodes(parent_id);
CREATE TABLE IF NOT EXISTS indexing_jobs(
 id text PRIMARY KEY, document_id text NOT NULL REFERENCES explorer_nodes(id) ON DELETE CASCADE,
 document_name text NOT NULL, status text NOT NULL, progress integer NOT NULL DEFAULT 0,
 message text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job_per_document ON indexing_jobs(document_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS chat_sessions(id text PRIMARY KEY, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS chat_messages(
 id text PRIMARY KEY, session_id text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
 role text NOT NULL, content text NOT NULL, retrieval jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations VALUES (1) ON CONFLICT DO NOTHING;
`;
