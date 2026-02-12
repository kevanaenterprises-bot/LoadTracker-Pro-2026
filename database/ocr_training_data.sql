-- OCR Training Data Table
-- This table stores OCR extraction results and user corrections to improve accuracy over time.
-- 
-- To apply this migration:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this entire script
-- 4. Click "Run" to execute

CREATE TABLE IF NOT EXISTS ocr_training_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  extracted_data JSONB NOT NULL,
  corrected_data JSONB,
  file_url TEXT,
  file_type TEXT,
  confidence_scores JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ocr_training_load ON ocr_training_data(load_id);
CREATE INDEX IF NOT EXISTS idx_ocr_training_created ON ocr_training_data(created_at);

-- Add comment describing the table
COMMENT ON TABLE ocr_training_data IS 'Stores OCR extraction results and user corrections for training and improving rate confirmation parsing accuracy';

-- Add comments for key columns
COMMENT ON COLUMN ocr_training_data.original_text IS 'Raw text extracted from the document via OCR';
COMMENT ON COLUMN ocr_training_data.extracted_data IS 'Initial parsed data from OCR (JSON format)';
COMMENT ON COLUMN ocr_training_data.corrected_data IS 'User-corrected data after review (JSON format) - used for training';
COMMENT ON COLUMN ocr_training_data.confidence_scores IS 'Confidence scores for each extracted field (JSON format)';
