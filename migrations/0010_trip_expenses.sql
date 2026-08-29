-- Travel expenses are synchronized with the existing trip revision transaction.
ALTER TABLE trips ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'KRW';
ALTER TABLE trips ADD COLUMN budget_minor INTEGER;
ALTER TABLE trips ADD COLUMN settled_at TEXT;
ALTER TABLE trips ADD COLUMN settlement_fingerprint TEXT;

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  exchange_rate_micros INTEGER NOT NULL CHECK (exchange_rate_micros >= 0),
  converted_minor INTEGER NOT NULL CHECK (converted_minor >= 0),
  rate_updated_at TEXT,
  rate_source TEXT NOT NULL DEFAULT '',
  paid_by_member_id TEXT NOT NULL,
  spent_at TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  linked_type TEXT,
  linked_id TEXT,
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (paid_by_member_id) REFERENCES members(id),
  FOREIGN KEY (created_by_member_id) REFERENCES members(id)
);
CREATE INDEX expenses_trip_date ON expenses(trip_id, spent_at DESC);

CREATE TABLE expense_shares (
  expense_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  share_minor INTEGER NOT NULL CHECK (share_minor >= 0),
  PRIMARY KEY (expense_id, member_id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Extend collaboration history and recoverable trash to expense entities.
CREATE TABLE trip_activity_expense (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'restored')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trip', 'item', 'flight', 'lodging', 'expense', 'file')),
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);
INSERT INTO trip_activity_expense SELECT * FROM trip_activity;
DROP TABLE trip_activity;
ALTER TABLE trip_activity_expense RENAME TO trip_activity;
CREATE INDEX trip_activity_trip_time ON trip_activity(trip_id, created_at DESC);

CREATE TABLE trip_trash_expense (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'flight', 'lodging', 'expense', 'file')),
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  deleted_by_member_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  restored_at TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (deleted_by_member_id) REFERENCES members(id)
);
INSERT INTO trip_trash_expense SELECT * FROM trip_trash;
DROP TABLE trip_trash;
ALTER TABLE trip_trash_expense RENAME TO trip_trash;
CREATE INDEX trip_trash_trip_time ON trip_trash(trip_id, restored_at, deleted_at DESC);
CREATE UNIQUE INDEX trip_trash_active_entity ON trip_trash(trip_id, entity_type, entity_id) WHERE restored_at IS NULL;
