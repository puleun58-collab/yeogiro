-- Add account authentication above the existing trip membership and legacy session model.
-- Existing members and sessions remain valid; account links start nullable for migration.
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  terms_version TEXT,
  terms_agreed_at TEXT,
  privacy_version TEXT,
  privacy_agreed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX auth_identities_account ON auth_identities(account_id);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  client_type TEXT NOT NULL DEFAULT 'browser' CHECK (client_type IN ('browser', 'pwa', 'unknown')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX auth_sessions_account ON auth_sessions(account_id, revoked_at);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at, revoked_at);

CREATE TABLE oauth_transactions (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/',
  device_id TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  client_type TEXT NOT NULL DEFAULT 'browser' CHECK (client_type IN ('browser', 'pwa', 'unknown')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX oauth_transactions_expiry ON oauth_transactions(expires_at, consumed_at);

CREATE TABLE auth_events (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  event_type TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE INDEX auth_events_account_time ON auth_events(account_id, created_at);

ALTER TABLE members ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX members_account ON members(account_id, revoked_at);
CREATE UNIQUE INDEX members_trip_account ON members(trip_id, account_id) WHERE account_id IS NOT NULL;
