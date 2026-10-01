-- Waypoint Operations Initial PostgreSQL Schema
-- Migration: 000001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role enum type
CREATE TYPE user_role AS ENUM ('admin', 'dispatcher', 'field_agent', 'driver');

-- Waypoint status enum type
CREATE TYPE waypoint_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled');

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'field_agent',
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Waypoints table
CREATE TABLE IF NOT EXISTS waypoints (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status waypoint_status NOT NULL DEFAULT 'pending',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_role user_role,
    due_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sync Event Log (for delta pull replication)
CREATE TABLE IF NOT EXISTS sync_events (
    sequence_id BIGSERIAL PRIMARY KEY,
    event_id UUID UNIQUE NOT NULL,
    client_id VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_waypoints_status ON waypoints(status);
CREATE INDEX IF NOT EXISTS idx_waypoints_assigned_role ON waypoints(assigned_role);
CREATE INDEX IF NOT EXISTS idx_waypoints_coordinates ON waypoints(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_sync_events_sequence ON sync_events(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON sync_events(entity_type, entity_id);

-- Seed initial test users
INSERT INTO users (id, email, name, role, phone) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@waypoint.local', 'Hesanda Liyanage (Admin)', 'admin', '+94 11 234 5678'),
('00000000-0000-0000-0000-000000000002', 'dispatcher@waypoint.local', 'Central Dispatcher', 'dispatcher', '+94 11 234 5679'),
('00000000-0000-0000-0000-000000000003', 'field@waypoint.local', 'Nuwan Silva (Field Inspector)', 'field_agent', '+94 77 123 4567'),
('00000000-0000-0000-0000-000000000004', 'driver@waypoint.local', 'Sunil Fernando (Logistics Driver)', 'driver', '+94 71 987 6543')
ON CONFLICT (id) DO NOTHING;

-- Seed initial operational waypoints across Sri Lanka
INSERT INTO waypoints (id, title, description, status, latitude, longitude, assigned_role, created_at, updated_at) VALUES
('wp-001', 'Colombo Port Logistics Hub - Terminal Inspection', 'Inspect container bay 4B and verify security seal manifests', 'in_progress', 6.9437, 79.8519, 'field_agent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('wp-002', 'Kandy Express Cargo Delivery', 'Delivery of medical supplies to Kandy General Hospital depot', 'assigned', 7.2906, 80.6337, 'driver', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('wp-003', 'Galle Coastal Station Environmental Audit', 'Collect sensor telemetry and water quality telemetry', 'pending', 6.0328, 80.2170, 'field_agent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('wp-004', 'Katunayake Air Cargo Transshipment', 'Pickup high-value avionics crate from BIA cargo holding area', 'completed', 7.1808, 79.8841, 'driver', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
