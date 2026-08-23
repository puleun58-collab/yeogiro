-- Extend the additive trash to reservation-document metadata without changing existing rows.
CREATE TABLE trip_trash_next (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'flight', 'lodging', 'file')),
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  deleted_by_member_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  restored_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (deleted_by_member_id) REFERENCES members(id)
);
INSERT INTO trip_trash_next (id,trip_id,entity_type,entity_id,label,snapshot_json,deleted_by_member_id,deleted_at,restored_at)
SELECT id,trip_id,entity_type,entity_id,label,snapshot_json,deleted_by_member_id,deleted_at,restored_at FROM trip_trash;
DROP TABLE trip_trash;
ALTER TABLE trip_trash_next RENAME TO trip_trash;
CREATE INDEX trip_trash_trip_time ON trip_trash(trip_id, restored_at, deleted_at DESC);
CREATE UNIQUE INDEX trip_trash_active_entity ON trip_trash(trip_id, entity_type, entity_id) WHERE restored_at IS NULL;
