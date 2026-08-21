PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  cities_json TEXT NOT NULL DEFAULT '[]',
  hero_file_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS members_trip_id ON members(trip_id);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by_member_id TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS invites_trip_id ON invites(trip_id);

CREATE TABLE IF NOT EXISTS travelers (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  day TEXT NOT NULL,
  time TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  move TEXT NOT NULL DEFAULT '',
  alarm TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS items_trip_day ON items(trip_id, day, time);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  airline TEXT NOT NULL DEFAULT '',
  flight_number TEXT NOT NULL DEFAULT '',
  depart_date TEXT NOT NULL,
  arrive_date TEXT NOT NULL,
  from_airport TEXT NOT NULL DEFAULT '',
  from_terminal TEXT NOT NULL DEFAULT '',
  from_city TEXT NOT NULL DEFAULT '',
  depart_time TEXT NOT NULL,
  to_airport TEXT NOT NULL DEFAULT '',
  to_terminal TEXT NOT NULL DEFAULT '',
  to_city TEXT NOT NULL DEFAULT '',
  arrive_time TEXT NOT NULL,
  reservation_number TEXT NOT NULL DEFAULT '',
  seat TEXT NOT NULL DEFAULT '',
  baggage TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lodgings (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  item_id TEXT,
  name TEXT NOT NULL,
  check_in_date TEXT NOT NULL,
  check_in_time TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  check_out_time TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  reservation_number TEXT NOT NULL DEFAULT '',
  guests TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  breakfast TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'flight', 'lodging', 'trip')),
  entity_id TEXT NOT NULL,
  reservation_number TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'flight', 'lodging', 'trip')),
  entity_id TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT 'indexeddb' CHECK (storage = 'indexeddb'),
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_member_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS files_trip_entity ON files(trip_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_ends_at INTEGER NOT NULL
);
