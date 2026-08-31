ALTER TABLE trips ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 0 CHECK (reminder_minutes IN (0, 10, 30, 60));
