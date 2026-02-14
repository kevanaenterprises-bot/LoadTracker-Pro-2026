-- Migration 001: Fix Schema Issues
-- Description: Adds missing settings table and ensures updated_at column exists in locations
-- Date: 2026-02-14

-- Add updated_at column to locations table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'locations' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE locations 
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    
    -- Set updated_at to created_at for existing records
    UPDATE locations 
    SET updated_at = created_at 
    WHERE updated_at IS NULL;
    
    RAISE NOTICE 'Added updated_at column to locations table';
  ELSE
    RAISE NOTICE 'updated_at column already exists in locations table';
  END IF;
END $$;

-- Create settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_settings_key'
  ) THEN
    CREATE INDEX idx_settings_key ON settings(key);
    RAISE NOTICE 'Created index idx_settings_key';
  ELSE
    RAISE NOTICE 'Index idx_settings_key already exists';
  END IF;
END $$;

-- Add comment for settings table
COMMENT ON TABLE settings IS 'Application settings (key-value pairs)';
