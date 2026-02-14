-- Migration: Add updated_at column to locations table
-- Description: Adds the updated_at timestamp column to track when locations are modified
-- Date: 2026-02-14

-- Add updated_at column if it doesn't exist
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
