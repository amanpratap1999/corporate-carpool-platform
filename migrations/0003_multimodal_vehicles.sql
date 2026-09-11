-- Migration 0003: Multimodal Vehicle Expansion
-- Adds vehicle_type enum, decouples passenger capacity, and allows motorcycle carpooling

DO $$ BEGIN
    CREATE TYPE vehicle_type AS ENUM ('CAR', 'MOTORCYCLE', 'VAN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_type vehicle_type NOT NULL DEFAULT 'CAR';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_passenger_capacity SMALLINT NOT NULL DEFAULT 4;

-- Relax vehicle seat constraint from >= 2 to >= 1 to allow two-wheelers/motorcycles
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS chk_vehicles_seats;
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_total_seats_check;
ALTER TABLE vehicles ADD CONSTRAINT chk_vehicles_seats CHECK (total_seats >= 1 AND total_seats <= 15);
