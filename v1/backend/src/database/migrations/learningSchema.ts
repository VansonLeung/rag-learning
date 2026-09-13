export const learningSchema = `
CREATE TABLE IF NOT EXISTS learning_sessions(
 id text PRIMARY KEY,
 exercise jsonb NOT NULL,
 answer_key jsonb NOT NULL,
 responses jsonb NOT NULL DEFAULT '{}',
 feedback jsonb,
 version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz
);
INSERT INTO schema_migrations VALUES (2) ON CONFLICT DO NOTHING;
`;
