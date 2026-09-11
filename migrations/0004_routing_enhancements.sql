-- Migration 0004: Routing Enhancements & Google Maps Integration
-- Adds place_id and polyline storage for authoritative routing

ALTER TABLE ride_routes ADD COLUMN IF NOT EXISTS google_route_id VARCHAR(255);
ALTER TABLE ride_routes ADD COLUMN IF NOT EXISTS encoded_polyline TEXT;

ALTER TABLE route_waypoints ADD COLUMN IF NOT EXISTS place_id VARCHAR(255);
ALTER TABLE pickup_points ADD COLUMN IF NOT EXISTS place_id VARCHAR(255);
ALTER TABLE drop_points ADD COLUMN IF NOT EXISTS place_id VARCHAR(255);
