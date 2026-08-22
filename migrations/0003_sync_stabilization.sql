-- Atomic optimistic-lock assertions and backwards-compatible invite usage limits.
CREATE TABLE IF NOT EXISTS sync_assertions (
  id TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value = 1)
);

ALTER TABLE invites ADD COLUMN max_uses INTEGER;
ALTER TABLE invites ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invites ADD COLUMN consumed_at TEXT;

