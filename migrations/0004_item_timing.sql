-- Optional timing metadata for accurate travel readiness and schedule conflict checks.
ALTER TABLE items ADD COLUMN end_time TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN preparation_minutes INTEGER NOT NULL DEFAULT 0 CHECK (preparation_minutes BETWEEN 0 AND 240);
