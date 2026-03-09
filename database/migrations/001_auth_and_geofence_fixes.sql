-- Migration 001: Auth fixes + geofence unique constraint
-- Run this against the Railway PostgreSQL database

-- 1. Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id)  -- one pending reset per user
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- 2. Unique constraint on geofence_timestamps so upsert works correctly
--    One (arrived) and one (departed) record per stop per load
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_geofence_load_stop_event'
  ) THEN
    ALTER TABLE geofence_timestamps
      ADD CONSTRAINT uq_geofence_load_stop_event
      UNIQUE (load_id, stop_id, event_type);
  END IF;
END $$;

-- 3. Ensure users with NULL password_hash are marked inactive
--    so they can't log in until a password is set
UPDATE users
SET is_active = false
WHERE password_hash IS NULL OR password_hash = '';
