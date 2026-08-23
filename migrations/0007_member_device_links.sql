-- One-time codes let an existing member connect another device without creating a duplicate member.
CREATE TABLE member_device_codes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX member_device_codes_member ON member_device_codes(member_id, revoked_at, consumed_at);
CREATE INDEX member_device_codes_expiry ON member_device_codes(expires_at);
