-- +goose Up
-- The store manager's own confirmation or dispute of what arrived, separate from the driver's delivery record.
CREATE TABLE store_confirmations (
 stop_id UUID PRIMARY KEY REFERENCES trip_stops(id) ON DELETE CASCADE,
 confirmed_by UUID NOT NULL REFERENCES users(id),
 outcome TEXT NOT NULL CHECK (outcome IN ('confirmed','disputed')),
 note TEXT NOT NULL DEFAULT '',
 at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- +goose Down
DROP TABLE IF EXISTS store_confirmations;
