-- Support bounded cleanup of security and expired session metadata.
CREATE INDEX IF NOT EXISTS auth_events_created_at ON auth_events(created_at);
CREATE INDEX IF NOT EXISTS security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS auth_sessions_revoked_at ON auth_sessions(revoked_at);
CREATE INDEX IF NOT EXISTS sessions_revoked_at ON sessions(revoked_at);
