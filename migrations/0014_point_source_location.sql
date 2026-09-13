-- Link pickup and drop points to passenger's saved user_locations when matching
ALTER TABLE pickup_points ADD COLUMN IF NOT EXISTS source_location_id UUID REFERENCES user_locations(id) ON DELETE SET NULL;
ALTER TABLE drop_points ADD COLUMN IF NOT EXISTS source_location_id UUID REFERENCES user_locations(id) ON DELETE SET NULL;
