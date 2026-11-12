CREATE TABLE push_alert_events (
  event_key TEXT PRIMARY KEY,
  session_key INTEGER NOT NULL,
  kind TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  retain_until INTEGER NOT NULL,
  session_json TEXT NOT NULL,
  cursor TEXT NOT NULL DEFAULT '',
  fanout_done INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_alert_events_pending ON push_alert_events(fanout_done, expires_at);

CREATE TABLE push_alert_deliveries (
  event_key TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_key, credential_hash)
);
CREATE INDEX push_alert_deliveries_pending ON push_alert_deliveries(status, next_attempt, lease_until);

CREATE TABLE push_alert_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
