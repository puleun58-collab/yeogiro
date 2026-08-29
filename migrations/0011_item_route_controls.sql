ALTER TABLE items ADD COLUMN fixed_schedule INTEGER NOT NULL DEFAULT 0 CHECK (fixed_schedule IN (0, 1));
ALTER TABLE items ADD COLUMN move_minutes INTEGER CHECK (move_minutes IS NULL OR (move_minutes >= 1 AND move_minutes <= 1440));
