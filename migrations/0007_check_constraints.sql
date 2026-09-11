-- Migration 0007: Database-level check constraints for seat bounds and integrity
-- These constraints enforce invariants at the database level, independent of application logic.

ALTER TABLE rides ADD CONSTRAINT chk_available_seats_non_negative CHECK (available_seats >= 0);
ALTER TABLE rides ADD CONSTRAINT chk_available_seats_le_total CHECK (available_seats <= total_seats_offered);
ALTER TABLE rides ADD CONSTRAINT chk_total_seats_positive CHECK (total_seats_offered > 0);
ALTER TABLE ride_passengers ADD CONSTRAINT chk_seats_booked_positive CHECK (seats_booked > 0);
