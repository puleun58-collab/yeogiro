-- Additive collaboration history and recoverable trash. Existing trip data is untouched.
CREATE TABLE trip_activity (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'restored')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trip', 'item', 'flight', 'lodging', 'file')),
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);
CREATE INDEX trip_activity_trip_time ON trip_activity(trip_id, created_at DESC);

CREATE TABLE trip_trash (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'flight', 'lodging')),
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  deleted_by_member_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  restored_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (deleted_by_member_id) REFERENCES members(id)
);
CREATE INDEX trip_trash_trip_time ON trip_trash(trip_id, restored_at, deleted_at DESC);
CREATE UNIQUE INDEX trip_trash_active_entity ON trip_trash(trip_id, entity_type, entity_id) WHERE restored_at IS NULL;
