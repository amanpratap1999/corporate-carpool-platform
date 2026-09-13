-- Partial index for active scheduled rides
CREATE INDEX IF NOT EXISTS idx_rides_org_departure_scheduled
  ON rides (organization_id, departure_time)
  WHERE status = 'SCHEDULED';
