#!/usr/bin/env node

/**
 * Migrate data from Supabase to Railway PostgreSQL
 * This script copies all data from your Supabase database to Railway
 */

import pg from 'pg';

const { Pool } = pg;

// Supabase REST API configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlksfrowyjprvjerydrp.databasepad.com';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Railway PostgreSQL connection
const RAILWAY_DB_URL = process.env.DATABASE_URL;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY not set');
  process.exit(1);
}

if (!RAILWAY_DB_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

// Tables to migrate in order (respecting foreign key dependencies)
const TABLES = [
  'users',
  'customers',
  'drivers',
  'locations',
  'rate_matrix',
  'settings',
  'loads',
  'load_stops',
  'invoices',
  'payments',
  'pod_documents',
  'geofence_timestamps',
  'driver_locations',
  'driver_position_history',
  'ifta_trips',
  'ifta_trip_states',
  'ifta_fuel_purchases',
  'ifta_state_mileage',
  'email_delivery_log',
  'email_logs',
  'here_devices',
  'here_geofences',
  'here_webhook_events',
  'driver_files',
  'driver_marker_history',
  'historical_markers',
  'destinations',
  'demo_visitors',
  'usage_tracking',
  'ocr_learning_data'
];

async function fetchFromSupabase(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.statusText}`);
  }

  return await response.json();
}

async function insertIntoRailway(pool, table, data) {
  if (!data || data.length === 0) {
    console.log(`  ⊘ No data in ${table}`);
    return 0;
  }

  // Get column names from first row
  const columns = Object.keys(data[0]);
  
  let inserted = 0;
  for (const row of data) {
    try {
      const values = columns.map(col => row[col]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      
      await pool.query(sql, values);
      inserted++;
    } catch (err) {
      console.error(`    ⚠️  Error inserting row in ${table}:`, err.message);
    }
  }

  return inserted;
}

async function migrate() {
  console.log('🔄 Starting migration from Supabase to Railway PostgreSQL...\n');

  const pool = new Pool({
    connectionString: RAILWAY_DB_URL,
    ssl: RAILWAY_DB_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to Railway PostgreSQL\n');

    for (const table of TABLES) {
      try {
        console.log(`📦 Migrating ${table}...`);
        
        const data = await fetchFromSupabase(table);
        const count = await insertIntoRailway(pool, table, data);
        
        console.log(`  ✅ Inserted ${count} rows into ${table}\n`);
      } catch (err) {
        console.error(`  ❌ Failed to migrate ${table}:`, err.message, '\n');
      }
    }

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
