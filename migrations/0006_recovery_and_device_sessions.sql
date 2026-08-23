-- Separate people/roles from device sessions without invalidating existing access tokens.
ALTER TABLE trips ADD COLUMN recovery_key_hash TEXT;
ALTER TABLE trips ADD COLUMN recovery_key_created_at TEXT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  client_type TEXT NOT NULL DEFAULT 'browser' CHECK (client_type IN ('browser', 'pwa', 'unknown')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX sessions_member_id ON sessions(member_id);
CREATE INDEX sessions_active_member ON sessions(member_id, revoked_at);

-- Existing member tokens remain valid and become legacy device sessions.
INSERT INTO sessions (id, member_id, token_hash, device_name, platform, client_type, created_at, last_seen_at, revoked_at)
SELECT 'ses_legacy_' || id, id, token_hash, '기존 기기', '기기 정보 없음', 'unknown', created_at, last_seen_at, revoked_at
FROM members;

-- The legacy column remains for schema compatibility but no longer contains an access-token hash.
UPDATE members SET token_hash = 'member_legacy_' || id;

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  event_type TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);
CREATE INDEX security_events_trip_time ON security_events(trip_id, created_at);
