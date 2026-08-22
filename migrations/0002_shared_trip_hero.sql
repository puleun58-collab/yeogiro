CREATE TABLE IF NOT EXISTS trip_hero_images (
  trip_id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  updated_by_member_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_member_id) REFERENCES members(id)
);
