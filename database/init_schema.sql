-- Complete database schema for LoadTracker TMS
-- This migration creates all tables needed for the application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (authentication and user management)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'driver')),
  driver_id UUID,
  subscription_tier VARCHAR(50) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'standard')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_driver_id ON users(driver_id);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  billing_address TEXT,
  billing_city VARCHAR(100),
  billing_state VARCHAR(2),
  billing_zip VARCHAR(20),
  notes TEXT,
  has_fuel_surcharge BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name);

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'on_route', 'off_duty')),
  current_location TEXT,
  truck_number VARCHAR(50),
  license_number VARCHAR(100),
  license_state VARCHAR(2),
  license_expiration DATE,
  medical_card_number VARCHAR(100),
  medical_card_expiration DATE,
  hire_date DATE,
  termination_date DATE,
  employment_status VARCHAR(50) DEFAULT 'active' CHECK (employment_status IN ('active', 'terminated')),
  date_of_birth DATE,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_employment_status ON drivers(employment_status);

-- Add foreign key constraint from users to drivers (after drivers table is created)
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_driver;
ALTER TABLE users ADD CONSTRAINT fk_users_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;

-- Locations table (shippers and receivers)
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(20),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  instructions TEXT,
  rate DECIMAL(10, 2) DEFAULT 0,
  location_type VARCHAR(50) CHECK (location_type IN ('shipper', 'receiver')),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geofence_radius INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_company_name ON locations(company_name);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(location_type);

-- Loads table
CREATE TABLE IF NOT EXISTS loads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_number VARCHAR(50) UNIQUE NOT NULL,
  bol_number VARCHAR(100),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  origin_city VARCHAR(100),
  origin_state VARCHAR(2),
  origin_address TEXT,
  dest_city VARCHAR(100),
  dest_state VARCHAR(2),
  dest_address TEXT,
  dest_company VARCHAR(255),
  destination_id UUID,
  pickup_date DATE,
  delivery_date DATE,
  cargo_description TEXT,
  weight INTEGER,
  status VARCHAR(50) DEFAULT 'UNASSIGNED' CHECK (status IN ('UNASSIGNED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'PAID')),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  rate DECIMAL(10, 2) DEFAULT 0,
  extra_stop_fee DECIMAL(10, 2) DEFAULT 0,
  lumper_fee DECIMAL(10, 2) DEFAULT 0,
  total_miles INTEGER,
  tracking_enabled BOOLEAN DEFAULT false,
  auto_invoice BOOLEAN DEFAULT false,
  acceptance_token VARCHAR(255),
  accepted_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  trip_number VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loads_load_number ON loads(load_number);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_driver_id ON loads(driver_id);
CREATE INDEX IF NOT EXISTS idx_loads_customer_id ON loads(customer_id);
CREATE INDEX IF NOT EXISTS idx_loads_acceptance_token ON loads(acceptance_token);

-- Load stops table (for multi-stop loads)
CREATE TABLE IF NOT EXISTS load_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  stop_type VARCHAR(50) CHECK (stop_type IN ('pickup', 'delivery')),
  stop_sequence INTEGER,
  company_name VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(20),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_load_stops_load_id ON load_stops(load_id);
CREATE INDEX IF NOT EXISTS idx_load_stops_location_id ON load_stops(location_id);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  emailed_at TIMESTAMP WITH TIME ZONE,
  emailed_to VARCHAR(255),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_load_id ON invoices(load_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(50) CHECK (payment_method IN ('check', 'ach', 'wire', 'credit_card', 'cash', 'other')),
  check_number VARCHAR(100),
  reference_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_load_id ON payments(load_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

-- Rate matrix table
CREATE TABLE IF NOT EXISTS rate_matrix (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  base_rate DECIMAL(10, 2) DEFAULT 0,
  per_mile_rate DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_matrix_city_state ON rate_matrix(city, state);

-- POD documents table
CREATE TABLE IF NOT EXISTS pod_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pod_documents_load_id ON pod_documents(load_id);

-- Geofence timestamps table
CREATE TABLE IF NOT EXISTS geofence_timestamps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES load_stops(id) ON DELETE SET NULL,
  stop_type VARCHAR(50) CHECK (stop_type IN ('pickup', 'delivery')),
  event_type VARCHAR(50) CHECK (event_type IN ('arrived', 'departed')),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  verified BOOLEAN DEFAULT false,
  verification_method VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_timestamps_load_id ON geofence_timestamps(load_id);
CREATE INDEX IF NOT EXISTS idx_geofence_timestamps_stop_id ON geofence_timestamps(stop_id);

-- IFTA trips table
CREATE TABLE IF NOT EXISTS ifta_trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  truck_number VARCHAR(50),
  quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER,
  trip_date DATE,
  origin_state VARCHAR(2),
  origin_city VARCHAR(100),
  destination_state VARCHAR(2),
  destination_city VARCHAR(100),
  total_miles INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ifta_trips_driver_id ON ifta_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_ifta_trips_load_id ON ifta_trips(load_id);
CREATE INDEX IF NOT EXISTS idx_ifta_trips_quarter_year ON ifta_trips(quarter, year);

-- IFTA trip states table (individual state mileage per trip)
CREATE TABLE IF NOT EXISTS ifta_trip_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ifta_trip_id UUID REFERENCES ifta_trips(id) ON DELETE CASCADE,
  state VARCHAR(2),
  miles INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ifta_trip_states_trip_id ON ifta_trip_states(ifta_trip_id);
CREATE INDEX IF NOT EXISTS idx_ifta_trip_states_state ON ifta_trip_states(state);

-- IFTA fuel purchases table
CREATE TABLE IF NOT EXISTS ifta_fuel_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  truck_number VARCHAR(50),
  quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER,
  purchase_date DATE,
  state VARCHAR(2),
  gallons DECIMAL(10, 2),
  price_per_gallon DECIMAL(10, 4),
  total_cost DECIMAL(10, 2),
  vendor VARCHAR(255),
  city VARCHAR(100),
  receipt_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ifta_fuel_purchases_quarter_year ON ifta_fuel_purchases(quarter, year);
CREATE INDEX IF NOT EXISTS idx_ifta_fuel_purchases_truck ON ifta_fuel_purchases(truck_number);

-- IFTA state mileage table (summary by state for reporting)
CREATE TABLE IF NOT EXISTS ifta_state_mileage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER,
  state VARCHAR(2),
  total_miles INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (quarter, year, state)
);

CREATE INDEX IF NOT EXISTS idx_ifta_state_mileage_quarter_year ON ifta_state_mileage(quarter, year);

-- Driver files table (documents management)
CREATE TABLE IF NOT EXISTS driver_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  category VARCHAR(50) CHECK (category IN ('medical_card', 'drivers_license', 'mvr', 'drug_test', 'training_cert', 'insurance', 'contract', 'other')),
  description TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_files_driver_id ON driver_files(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_files_category ON driver_files(category);

-- OCR training data table (from existing migration)
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

CREATE INDEX IF NOT EXISTS idx_ocr_training_load ON ocr_training_data(load_id);
CREATE INDEX IF NOT EXISTS idx_ocr_training_created ON ocr_training_data(created_at);

-- Demo visitors table (for tracking demo usage)
CREATE TABLE IF NOT EXISTS demo_visitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_id VARCHAR(255) UNIQUE NOT NULL,
  first_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  visit_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_demo_visitors_visitor_id ON demo_visitors(visitor_id);

-- Usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feature VARCHAR(100) NOT NULL,
  month_year VARCHAR(7) NOT NULL CHECK (month_year ~ '^\d{4}-\d{2}$'),  -- Format: YYYY-MM
  count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, feature, month_year)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_feature ON usage_tracking(feature);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_month_year ON usage_tracking(month_year);

-- Insert default admin user
-- Password is stored as plaintext 'admin123' in password_hash column (matching existing Supabase implementation)
INSERT INTO users (email, password_hash, name, role, is_active)
VALUES ('admin@example.com', 'admin123', 'Admin User', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Create comments for documentation
COMMENT ON TABLE users IS 'User authentication and authorization';
COMMENT ON TABLE customers IS 'Customer/shipper information';
COMMENT ON TABLE drivers IS 'Driver profiles and information';
COMMENT ON TABLE locations IS 'Pickup and delivery locations';
COMMENT ON TABLE loads IS 'Load/shipment information';
COMMENT ON TABLE load_stops IS 'Multiple stops per load';
COMMENT ON TABLE invoices IS 'Customer invoices';
COMMENT ON TABLE payments IS 'Payment records for invoices';
COMMENT ON TABLE rate_matrix IS 'Rate configuration by destination';
COMMENT ON TABLE pod_documents IS 'Proof of delivery documents';
COMMENT ON TABLE geofence_timestamps IS 'Automatic timestamp tracking via geofencing';
COMMENT ON TABLE ifta_trips IS 'IFTA trip records';
COMMENT ON TABLE ifta_trip_states IS 'State-by-state mileage for IFTA trips';
COMMENT ON TABLE ifta_fuel_purchases IS 'Fuel purchase records for IFTA';
COMMENT ON TABLE ifta_state_mileage IS 'Summary of mileage by state for IFTA reporting';
COMMENT ON TABLE driver_files IS 'Driver document management';
COMMENT ON TABLE ocr_training_data IS 'OCR extraction results and corrections for training';
COMMENT ON TABLE demo_visitors IS 'Demo mode visitor tracking';
COMMENT ON TABLE usage_tracking IS 'Application usage analytics';
