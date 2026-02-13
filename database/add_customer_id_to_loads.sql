-- Add customer_id column to loads table
-- This column enables invoice emails to be sent to customers by linking loads to customer records.
-- 
-- To apply this migration:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this entire script
-- 4. Click "Run" to execute

-- Add the customer_id column (nullable for existing records)
ALTER TABLE loads ADD COLUMN IF NOT EXISTS customer_id UUID;

-- Add foreign key constraint
-- Using ON DELETE SET NULL to preserve load records even if a customer is deleted
ALTER TABLE loads 
ADD CONSTRAINT fk_loads_customer 
FOREIGN KEY (customer_id) 
REFERENCES customers(id) 
ON DELETE SET NULL;

-- Create index for better query performance when filtering or joining by customer
CREATE INDEX IF NOT EXISTS idx_loads_customer ON loads(customer_id);

-- Add column comment explaining its purpose
COMMENT ON COLUMN loads.customer_id IS 'References the customer who will be invoiced for this load';
