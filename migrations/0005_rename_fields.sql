-- Migration 0005: Rename fields to canonical names (idempotent)
-- Safe to run on fresh databases and on databases that already have the renamed columns.

-- Rename seats_allocated -> seats_booked (only if column exists with old name)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_passengers' AND column_name = 'seats_allocated'
  ) THEN
    ALTER TABLE ride_passengers RENAME COLUMN seats_allocated TO seats_booked;
  END IF;
END $$;

-- Rename overview_polyline -> encoded_polyline (only if column exists with old name)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_routes' AND column_name = 'overview_polyline'
  ) THEN
    ALTER TABLE ride_routes RENAME COLUMN overview_polyline TO encoded_polyline;
  END IF;
END $$;

-- Add encoded_polyline to ride_routes if neither old nor new column exists yet
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_routes'
      AND column_name IN ('overview_polyline', 'encoded_polyline')
  ) THEN
    ALTER TABLE ride_routes ADD COLUMN encoded_polyline TEXT;
  END IF;
END $$;

-- Add seats_booked to ride_passengers if neither old nor new column exists yet
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_passengers'
      AND column_name IN ('seats_allocated', 'seats_booked')
  ) THEN
    ALTER TABLE ride_passengers ADD COLUMN seats_booked INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Add lifecycle timestamps (idempotent via IF NOT EXISTS)
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
