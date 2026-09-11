-- Migration 0006: Ensure invitation_token_expires_at column exists
-- The schema uses invitation_token_expires_at but earlier migrations may have used
-- invitation_expires_at as the column name. This migration ensures both names
-- are reconciled and the canonical column exists.

-- Add invitation_token_expires_at if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token_expires_at TIMESTAMP WITH TIME ZONE;

-- If the old name (invitation_expires_at) exists and the new one does not have data,
-- copy data from old column to new column, then drop old column
DO $$ BEGIN
  -- Check if old column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'invitation_expires_at'
  ) THEN
    -- Copy data from old column to new column (where new column is null)
    UPDATE users
    SET invitation_token_expires_at = invitation_expires_at
    WHERE invitation_token_expires_at IS NULL AND invitation_expires_at IS NOT NULL;
    -- Drop old column
    ALTER TABLE users DROP COLUMN invitation_expires_at;
  END IF;
END $$;
