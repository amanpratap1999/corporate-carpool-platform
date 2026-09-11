-- Migration 0002: Security & Authentication Columns
-- Adds password_hash, external_idp_sub, and invitation tracking to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_idp_sub VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token);
