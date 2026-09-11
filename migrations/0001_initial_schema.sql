-- Migration 0001: Initial Canonical Schema
-- Target: PostgreSQL 16+
-- Preserves docs/DATABASE_SCHEMA.md 1:1

-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Domain Enums
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_status AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_INSPECTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ride_status AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ride_request_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE waypoint_type AS ENUM ('ORIGIN', 'CORRIDOR', 'DESTINATION', 'PASSENGER_STOP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'RIDE_REQUESTED', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_CANCELLED',
        'RIDE_CANCELLED', 'RIDE_STARTED', 'RIDE_COMPLETED', 'SYSTEM_ANNOUNCEMENT', 'USER_JOINED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'STATE_TRANSITION', 'DELETE', 'CANCEL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Organizations (Tenant Root)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    allowed_email_domains TEXT[] NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Users (Corporate Identity)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    avatar_url TEXT,
    status user_status NOT NULL DEFAULT 'ACTIVE',
    work_department VARCHAR(100),
    work_location VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_org_email UNIQUE (organization_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_org_status ON users(organization_id, status);

-- 4. User Capabilities (RBAC)
CREATE TABLE IF NOT EXISTS user_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    can_ride BOOLEAN NOT NULL DEFAULT true,
    can_drive BOOLEAN NOT NULL DEFAULT false,
    is_org_admin BOOLEAN NOT NULL DEFAULT false,
    driver_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_capabilities_driver ON user_capabilities(organization_id, can_drive);

-- 5. User Locations
CREATE TABLE IF NOT EXISTS user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    label VARCHAR(100) NOT NULL,
    address_text TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    place_id VARCHAR(255),
    is_default_pickup BOOLEAN NOT NULL DEFAULT false,
    is_default_drop BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);

-- 6. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year SMALLINT NOT NULL CHECK (year >= 1990 AND year <= 2030),
    color VARCHAR(50) NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    total_seats SMALLINT NOT NULL CHECK (total_seats >= 2 AND total_seats <= 15),
    status vehicle_status NOT NULL DEFAULT 'ACTIVE',
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vehicles_org_plate UNIQUE (organization_id, license_plate)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);

-- 7. Rides
CREATE TABLE IF NOT EXISTS rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    status ride_status NOT NULL DEFAULT 'DRAFT',
    departure_time TIMESTAMPTZ NOT NULL,
    arrival_time_estimated TIMESTAMPTZ NOT NULL,
    total_seats_offered SMALLINT NOT NULL CHECK (total_seats_offered >= 1 AND total_seats_offered <= 14),
    available_seats SMALLINT NOT NULL,
    cost_per_seat_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_per_seat_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    notes TEXT,
    cancelled_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rides_available_seats_bounds CHECK (available_seats >= 0 AND available_seats <= total_seats_offered),
    CONSTRAINT chk_rides_arrival_after_departure CHECK (arrival_time_estimated > departure_time)
);
CREATE INDEX IF NOT EXISTS idx_rides_org_departure ON rides(organization_id, departure_time, status);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id, departure_time);

-- 8. Ride Routes
CREATE TABLE IF NOT EXISTS ride_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    origin_address TEXT NOT NULL,
    origin_latitude NUMERIC(10, 7) NOT NULL CHECK (origin_latitude >= -90 AND origin_latitude <= 90),
    origin_longitude NUMERIC(10, 7) NOT NULL CHECK (origin_longitude >= -180 AND origin_longitude <= 180),
    destination_address TEXT NOT NULL,
    destination_latitude NUMERIC(10, 7) NOT NULL CHECK (destination_latitude >= -90 AND destination_latitude <= 90),
    destination_longitude NUMERIC(10, 7) NOT NULL CHECK (destination_longitude >= -180 AND destination_longitude <= 180),
    total_distance_meters INTEGER NOT NULL CHECK (total_distance_meters > 0),
    total_duration_seconds INTEGER NOT NULL CHECK (total_duration_seconds > 0),
    min_latitude NUMERIC(10, 7) NOT NULL,
    max_latitude NUMERIC(10, 7) NOT NULL,
    min_longitude NUMERIC(10, 7) NOT NULL,
    max_longitude NUMERIC(10, 7) NOT NULL,
    bounding_box JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ride_routes_bbox ON ride_routes(min_latitude, max_latitude, min_longitude, max_longitude);

-- 9. Route Waypoints
CREATE TABLE IF NOT EXISTS route_waypoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES ride_routes(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    stop_order SMALLINT NOT NULL CHECK (stop_order >= 0),
    point_type waypoint_type NOT NULL,
    address_text TEXT,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    estimated_arrival_offset_seconds INTEGER NOT NULL DEFAULT 0 CHECK (estimated_arrival_offset_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_route_waypoints_order UNIQUE (route_id, stop_order)
);
CREATE INDEX IF NOT EXISTS idx_route_waypoints_coords ON route_waypoints(latitude, longitude);

-- 10. Commuter Pickup & Drop Points
CREATE TABLE IF NOT EXISTS pickup_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    address_text TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    landmark_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drop_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    address_text TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    landmark_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Ride Requests
CREATE TABLE IF NOT EXISTS ride_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    pickup_point_id UUID NOT NULL REFERENCES pickup_points(id) ON DELETE RESTRICT,
    drop_point_id UUID NOT NULL REFERENCES drop_points(id) ON DELETE RESTRICT,
    requested_seats SMALLINT NOT NULL DEFAULT 1 CHECK (requested_seats >= 1 AND requested_seats <= 4),
    status ride_request_status NOT NULL DEFAULT 'PENDING',
    rider_note TEXT,
    rejection_reason TEXT,
    cancellation_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ride_requests_ride ON ride_requests(ride_id, status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger ON ride_requests(passenger_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ride_requests_active_passenger
    ON ride_requests (ride_id, passenger_id)
    WHERE status IN ('PENDING', 'ACCEPTED');

-- 12. Ride Passengers (Manifest)
CREATE TABLE IF NOT EXISTS ride_passengers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ride_request_id UUID NOT NULL UNIQUE REFERENCES ride_requests(id) ON DELETE RESTRICT,
    seats_allocated SMALLINT NOT NULL CHECK (seats_allocated >= 1),
    cost_charged_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_charged_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ride_passengers_ride_user UNIQUE (ride_id, passenger_id)
);

-- 13. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL DEFAULT 'IN_APP',
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);

-- 14. Audit Logs (Immutable Ledger)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action audit_action NOT NULL,
    from_state VARCHAR(50),
    to_state VARCHAR(50),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at, entity_type);
