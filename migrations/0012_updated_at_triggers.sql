-- Trigger function to automatically update updated_at timestamp on record updates
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_updated_at ON organizations;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON users;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON user_capabilities;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON user_capabilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON user_locations;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON user_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON vehicles;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON rides;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON ride_routes;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ride_routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON ride_requests;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON user_preferences;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON rate_limits;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
