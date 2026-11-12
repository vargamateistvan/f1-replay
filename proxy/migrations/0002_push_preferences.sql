CREATE TABLE push_preferences (
  credential_hash TEXT PRIMARY KEY REFERENCES push_subscriptions(credential_hash) ON DELETE CASCADE,
  preferences TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
