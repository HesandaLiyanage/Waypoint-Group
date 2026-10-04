-- +goose Up
-- Self-registration creates inactive accounts that a dispatcher approves.
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN work_id TEXT;
-- +goose Down
ALTER TABLE users DROP COLUMN work_id;
ALTER TABLE users DROP COLUMN phone;
