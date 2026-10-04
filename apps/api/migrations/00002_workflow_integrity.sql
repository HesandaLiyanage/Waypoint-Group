-- +goose Up
-- Remove only the synthetic references and their sample plans/orders.
DELETE FROM plans WHERE id IN (SELECT ts.plan_id FROM trip_stops ts JOIN orders o ON o.id=ts.order_id WHERE o.outlet_id LIKE 'OUT-%');
DELETE FROM orders WHERE outlet_id LIKE 'OUT-%';
DELETE FROM vehicle_availability WHERE vehicle_id LIKE 'VEH-%';
DELETE FROM fuel_ledger WHERE vehicle_id LIKE 'VEH-%';
DELETE FROM outlet_service_state WHERE outlet_id LIKE 'OUT-%';
DELETE FROM outlets WHERE outlet_id LIKE 'OUT-%';
DELETE FROM vehicles WHERE vehicle_id LIKE 'VEH-%';
DELETE FROM calendar_days WHERE date < '2024-01-01' OR date > '2026-06-28';
UPDATE users SET outlet_id='OUT001' WHERE outlet_id='OUT-FRESH-001';
UPDATE users SET outlet_id='OUT055' WHERE outlet_id='OUT-FRESH-055';
UPDATE users SET vehicle_id='VEH035' WHERE vehicle_id='VEH-001';
ALTER TABLE load_checks ADD COLUMN acknowledged_by UUID REFERENCES users(id);
ALTER TABLE load_checks ADD COLUMN acknowledged_at TIMESTAMPTZ;
ALTER TABLE load_checks ADD COLUMN acknowledgment_note TEXT;
ALTER TABLE trips ADD COLUMN acknowledged_version INTEGER;
ALTER TABLE stop_receipts ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE stop_receipts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stop_receipts ADD COLUMN verified_at TIMESTAMPTZ;
CREATE TABLE capacity_requests (
 id UUID PRIMARY KEY, depot TEXT NOT NULL, week_start DATE NOT NULL,
 action TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed',
 created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workflow_commands (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX device_event_sequence ON device_events(user_id,device_id,device_seq);
ALTER TABLE photos ADD COLUMN content BYTEA;
-- +goose Down
ALTER TABLE photos DROP COLUMN content;
DROP TABLE IF EXISTS workflow_commands;
DROP TABLE IF EXISTS capacity_requests;
DROP INDEX IF EXISTS device_event_sequence;
ALTER TABLE stop_receipts DROP COLUMN expires_at, DROP COLUMN attempts, DROP COLUMN verified_at;
ALTER TABLE trips DROP COLUMN acknowledged_version;
ALTER TABLE load_checks DROP COLUMN acknowledged_by, DROP COLUMN acknowledged_at, DROP COLUMN acknowledgment_note;
