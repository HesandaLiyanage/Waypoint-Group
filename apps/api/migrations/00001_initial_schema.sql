-- +goose Up
-- Waypoint Delivery Platform Initial PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users and Authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    pin_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL CHECK (role IN ('dispatcher', 'loader', 'driver', 'store_manager')),
    depot VARCHAR(100),
    outlet_id VARCHAR(100),
    vehicle_id VARCHAR(100),
    locale VARCHAR(10) NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'si', 'ta')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by UUID
);

-- Reference Data (Loaded from CSVs)
CREATE TABLE IF NOT EXISTS outlets (
    outlet_id VARCHAR(100) PRIMARY KEY,
    brand VARCHAR(50) NOT NULL CHECK (brand IN ('Fresh', 'Style', 'Tech')),
    district VARCHAR(100) NOT NULL,
    depot VARCHAR(100) NOT NULL CHECK (depot IN ('Peliyagoda', 'Kandy')),
    dock_type VARCHAR(50) NOT NULL CHECK (dock_type IN ('rear_dock', 'street', 'mall_bay')),
    parking_constraint VARCHAR(50) NOT NULL CHECK (parking_constraint IN ('normal', 'van_only', 'mall_dock')),
    mall_window VARCHAR(50),
    window_open_time TIME NOT NULL,
    window_close_time TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id VARCHAR(100) PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('truck', 'van')),
    temp VARCHAR(50) NOT NULL CHECK (temp IN ('reefer', 'ambient')),
    weight_cap_kg INTEGER NOT NULL,
    volume_cap_m3 NUMERIC(8,3) NOT NULL,
    fuel_type VARCHAR(50) NOT NULL,
    km_per_l NUMERIC(6,2) NOT NULL,
    weekly_fuel_quota_l NUMERIC(8,2) NOT NULL,
    depot VARCHAR(100) NOT NULL CHECK (depot IN ('Peliyagoda', 'Kandy'))
);

CREATE TABLE IF NOT EXISTS calendar_days (
    date DATE PRIMARY KEY,
    dow INTEGER NOT NULL,
    dow_name VARCHAR(20) NOT NULL,
    is_weekend INTEGER NOT NULL,
    iso_year INTEGER NOT NULL,
    iso_week INTEGER NOT NULL,
    is_payday INTEGER NOT NULL,
    festival VARCHAR(100) NOT NULL,
    festival_ramp NUMERIC(4,2) NOT NULL,
    is_holiday INTEGER NOT NULL,
    monsoon INTEGER NOT NULL,
    is_operating INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS district_travel (
    district VARCHAR(100) NOT NULL,
    depot VARCHAR(100) NOT NULL,
    road_class VARCHAR(20) NOT NULL,
    free_flow_kmh NUMERIC(6,2) NOT NULL,
    depot_to_district_km NUMERIC(6,2) NOT NULL,
    depot_to_district_freeflow_min INTEGER NOT NULL,
    inter_stop_km NUMERIC(6,2) NOT NULL,
    inter_stop_freeflow_min INTEGER NOT NULL,
    PRIMARY KEY (district, depot)
);

CREATE TABLE IF NOT EXISTS service_allowance (
    brand VARCHAR(50) NOT NULL,
    dock_type VARCHAR(50) NOT NULL,
    service_allowance_min INTEGER NOT NULL,
    PRIMARY KEY (brand, dock_type)
);

CREATE TABLE IF NOT EXISTS vehicle_availability (
    vehicle_id VARCHAR(100) NOT NULL REFERENCES vehicles(vehicle_id),
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('available', 'in_workshop')),
    PRIMARY KEY (vehicle_id, date)
);

CREATE TABLE IF NOT EXISTS catalog_items (
    sku VARCHAR(100) PRIMARY KEY,
    brand VARCHAR(50) NOT NULL CHECK (brand IN ('Fresh', 'Style', 'Tech')),
    name_en VARCHAR(255) NOT NULL,
    name_si VARCHAR(255) NOT NULL,
    name_ta VARCHAR(255) NOT NULL,
    unit_weight_kg NUMERIC(8,3) NOT NULL,
    unit_volume_m3 NUMERIC(8,4) NOT NULL,
    temp_requirement VARCHAR(50) NOT NULL CHECK (temp_requirement IN ('ambient', 'chilled'))
);

-- Ordering Domain
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    ref VARCHAR(100) UNIQUE NOT NULL,
    outlet_id VARCHAR(100) NOT NULL REFERENCES outlets(outlet_id),
    brand VARCHAR(50) NOT NULL,
    delivery_date DATE NOT NULL,
    temp_requirement VARCHAR(50) NOT NULL CHECK (temp_requirement IN ('ambient', 'chilled')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('submitted', 'queued', 'planned', 'loading', 'on_route', 'delivered', 'delivered_short', 'failed', 'deferred', 'cancelled')),
    total_units INTEGER NOT NULL,
    total_weight_g BIGINT NOT NULL,
    total_volume_ul BIGINT NOT NULL,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ,
    is_late BOOLEAN NOT NULL DEFAULT false,
    source VARCHAR(50) NOT NULL DEFAULT 'app',
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_lines (
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    sku VARCHAR(100) NOT NULL REFERENCES catalog_items(sku),
    qty INTEGER NOT NULL,
    weight_g BIGINT NOT NULL,
    volume_ul BIGINT NOT NULL,
    PRIMARY KEY (order_id, line_no)
);

-- Planning Domain
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY,
    depot VARCHAR(100) NOT NULL CHECK (depot IN ('Peliyagoda', 'Kandy')),
    plan_date DATE NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
    strategy VARCHAR(50) NOT NULL CHECK (strategy IN ('fairness_first', 'max_served')),
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES users(id),
    published_at TIMESTAMPTZ,
    UNIQUE (depot, plan_date, version)
);

-- Partial unique index: at most one published plan per (depot, plan_date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_one_published_per_depot_date
    ON plans(depot, plan_date) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    vehicle_id VARCHAR(100) NOT NULL REFERENCES vehicles(vehicle_id),
    trip_no INTEGER NOT NULL CHECK (trip_no IN (1, 2)),
    brand VARCHAR(50) NOT NULL,
    district VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('planned', 'loading', 'sealed', 'departed', 'completed', 'aborted')),
    planned_depart TIMESTAMPTZ NOT NULL,
    minutes JSONB NOT NULL,
    est_km NUMERIC(8,2) NOT NULL,
    est_fuel_ml BIGINT NOT NULL,
    loaded_weight_g BIGINT NOT NULL DEFAULT 0,
    loaded_volume_ul BIGINT NOT NULL DEFAULT 0,
    UNIQUE (plan_id, vehicle_id, trip_no)
);

CREATE TABLE IF NOT EXISTS trip_stops (
    id UUID PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id),
    seq INTEGER NOT NULL,
    eta TIMESTAMPTZ,
    eta_source VARCHAR(50),
    window_open TIME NOT NULL,
    window_close TIME NOT NULL,
    late_risk REAL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'arrived', 'delivered', 'delivered_short', 'failed', 'receipt_confirmed', 'receipt_disputed')),
    UNIQUE (trip_id, seq),
    UNIQUE (plan_id, order_id)
);

CREATE TABLE IF NOT EXISTS deferrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id),
    reason_code VARCHAR(100) NOT NULL,
    reason_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    decided_by VARCHAR(50) NOT NULL,
    carried_to DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outlet_service_state (
    outlet_id VARCHAR(100) PRIMARY KEY REFERENCES outlets(outlet_id),
    last_served_date DATE,
    skip_streak INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fuel_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(100) NOT NULL REFERENCES vehicles(vehicle_id),
    iso_year INTEGER NOT NULL,
    iso_week INTEGER NOT NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    liters_ml BIGINT NOT NULL,
    kind VARCHAR(50) NOT NULL CHECK (kind IN ('reserve', 'release')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Loading & Verification
CREATE TABLE IF NOT EXISTS load_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES trip_stops(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('ok', 'short', 'damaged')),
    qty_short INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    photo_id UUID,
    by_user UUID NOT NULL REFERENCES users(id),
    at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_event_id UUID UNIQUE NOT NULL
);

-- Receipt & Delivery Confirmation
CREATE TABLE IF NOT EXISTS stop_receipts (
    stop_id UUID PRIMARY KEY REFERENCES trip_stops(id) ON DELETE CASCADE,
    code_salt VARCHAR(64) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    receipt_code VARCHAR(10),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipt_confirmations (
    stop_id UUID PRIMARY KEY REFERENCES trip_stops(id) ON DELETE CASCADE,
    confirmed_by UUID NOT NULL REFERENCES users(id),
    at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL CHECK (status IN ('ok', 'short', 'damaged', 'disputed')),
    lines JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(100) NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    stop_id UUID REFERENCES trip_stops(id) ON DELETE SET NULL,
    raised_by UUID NOT NULL REFERENCES users(id),
    raised_role VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ack', 'resolved')),
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY,
    stop_id UUID REFERENCES trip_stops(id) ON DELETE SET NULL,
    kind VARCHAR(50) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    bytes INTEGER NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Offline Sync & Event Log
CREATE TABLE IF NOT EXISTS device_events (
    event_id UUID PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    device_seq BIGINT NOT NULL,
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    plan_version_seen INTEGER,
    client_ts TIMESTAMPTZ NOT NULL,
    server_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    result VARCHAR(50) NOT NULL CHECK (result IN ('accepted', 'duplicate', 'rejected')),
    reject_code VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS event_feed (
    seq BIGSERIAL PRIMARY KEY,
    scope VARCHAR(100) NOT NULL,
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Transactional Outbox
CREATE TABLE IF NOT EXISTS outbox (
    id BIGSERIAL PRIMARY KEY,
    topic VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    dedupe_key VARCHAR(255) UNIQUE,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    done_at TIMESTAMPTZ,
    last_error TEXT
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(100) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Idempotency Store
CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('in_progress', 'done')),
    response_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, key)
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    before JSONB,
    after JSONB,
    request_id VARCHAR(100)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_outlet_date ON orders(outlet_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_depot_date ON orders(delivery_date, status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_status ON trips(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_seq ON trip_stops(trip_id, seq);
CREATE INDEX IF NOT EXISTS idx_trip_stops_order ON trip_stops(order_id);
CREATE INDEX IF NOT EXISTS idx_event_feed_scope_seq ON event_feed(scope, seq);
CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON outbox(available_at, attempts) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- +goose Down
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS outbox CASCADE;
DROP TABLE IF EXISTS event_feed CASCADE;
DROP TABLE IF EXISTS device_events CASCADE;
DROP TABLE IF EXISTS photos CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS receipt_confirmations CASCADE;
DROP TABLE IF EXISTS stop_receipts CASCADE;
DROP TABLE IF EXISTS load_checks CASCADE;
DROP TABLE IF EXISTS fuel_ledger CASCADE;
DROP TABLE IF EXISTS outlet_service_state CASCADE;
DROP TABLE IF EXISTS deferrals CASCADE;
DROP TABLE IF EXISTS trip_stops CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS order_lines CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS catalog_items CASCADE;
DROP TABLE IF EXISTS vehicle_availability CASCADE;
DROP TABLE IF EXISTS service_allowance CASCADE;
DROP TABLE IF EXISTS district_travel CASCADE;
DROP TABLE IF EXISTS calendar_days CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
