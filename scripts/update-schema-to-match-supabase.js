#!/usr/bin/env node

/**
 * Update Railway schema to match Supabase schema
 * Adds missing columns and fixes data type mismatches
 */

import pg from 'pg';

const { Pool } = pg;

const RAILWAY_DB_URL = process.env.DATABASE_URL;

if (!RAILWAY_DB_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

async function updateSchema() {
  console.log('🔄 Updating Railway schema to match Supabase...\n');

  const pool = new Pool({
    connectionString: RAILWAY_DB_URL,
    ssl: RAILWAY_DB_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to Railway PostgreSQL\n');

    // Add missing columns to customers table
    console.log('📝 Updating customers table...');
    try {
      await pool.query(`
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS pod_email VARCHAR(255);
      `);
      console.log('  ✅ Added pod_email column to customers');
    } catch (err) {
      console.error('  ⚠️  Error updating customers:', err.message);
    }

    // Add missing columns to drivers table
    console.log('📝 Updating drivers table...');
    try {
      await pool.query(`
        ALTER TABLE drivers 
        ADD COLUMN IF NOT EXISTS last_known_lat NUMERIC(10, 8),
        ADD COLUMN IF NOT EXISTS last_known_lng NUMERIC(11, 8);
      `);
      console.log('  ✅ Added last_known_lat and last_known_lng columns to drivers');
    } catch (err) {
      console.error('  ⚠️  Error updating drivers:', err.message);
    }

    // Fix loads table numeric columns (change from INTEGER to NUMERIC)
    console.log('📝 Updating loads table...');
    try {
      // Check current column types and alter if needed
      const result = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'loads' 
        AND column_name IN ('rate', 'extra_stop_fee', 'lumper_fee', 'fuel_surcharge')
      `);
      
      for (const row of result.rows) {
        if (row.data_type === 'integer') {
          await pool.query(`
            ALTER TABLE loads ALTER COLUMN ${row.column_name} TYPE NUMERIC(10, 2);
          `);
          console.log(`  ✅ Changed ${row.column_name} to NUMERIC(10, 2)`);
        }
      }
    } catch (err) {
      console.error('  ⚠️  Error updating loads:', err.message);
    }

    // Update settings table to use key as primary key instead of id
    console.log('📝 Updating settings table...');
    try {
      // Check if settings table exists and has proper structure
      const settingsCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'settings'
      `);

      const hasId = settingsCheck.rows.some(row => row.column_name === 'id');
      const hasKey = settingsCheck.rows.some(row => row.column_name === 'key');

      if (!hasKey) {
        await pool.query(`
          ALTER TABLE settings ADD COLUMN IF NOT EXISTS key VARCHAR(255) UNIQUE;
        `);
        console.log('  ✅ Added key column to settings');
      }

      if (hasId) {
        await pool.query(`
          ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey CASCADE;
          ALTER TABLE settings ADD PRIMARY KEY (key);
          ALTER TABLE settings DROP COLUMN IF EXISTS id;
        `);
        console.log('  ✅ Updated settings primary key from id to key');
      }
    } catch (err) {
      console.error('  ⚠️  Error updating settings:', err.message);
    }

    // Disable foreign key constraints during migration
    console.log('📝 Disabling foreign key constraints temporarily...');
    try {
      const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      for (const { table_name } of tables.rows) {
        try {
          await pool.query(`ALTER TABLE ${table_name} DISABLE TRIGGER ALL`);
        } catch (err) {
          // Silently skip if trigger doesn't exist
        }
      }
      console.log('  ✅ Foreign key constraints disabled\n');
    } catch (err) {
      console.error('  ⚠️  Error disabling constraints:', err.message);
    }

    console.log('✅ Schema update complete!');
    console.log('ℹ️  You can now run the migration script to copy data from Supabase.\n');
  } catch (err) {
    console.error('❌ Schema update failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateSchema();
