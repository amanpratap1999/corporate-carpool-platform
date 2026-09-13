-- Optional PostGIS spatial indexing for high-volume corridor bounding box queries
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE ride_routes ADD COLUMN IF NOT EXISTS bbox_geom geometry(POLYGON, 4326);
CREATE INDEX IF NOT EXISTS idx_ride_routes_bbox_gist ON ride_routes USING GIST (bbox_geom);
