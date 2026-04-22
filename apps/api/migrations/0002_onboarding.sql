-- Conversations: a single chat session between the user and the AI, scoped by `kind`.
-- `kind` = 'onboarding' for the initial discovery chat; later phases will add 'session_adjust', etc.
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_kind ON conversations(user_id, kind);

-- Messages: turns within a conversation. role = system|user|assistant|tool.
-- `tool_calls` is a JSON array of { id, name, input } when the assistant called tools.
-- `tool_call_id` is set on role='tool' to reference the originating assistant call.
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  tool_calls       TEXT,
  tool_call_id     TEXT,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Profiles: one per user. `data` is a JSON blob of the extracted discovery profile
-- (demographics, goals, availability, health, holistic). Schema lives in TypeScript;
-- keeping it JSON here avoids churning migrations as the discovery spec evolves.
CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY,
  data         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
