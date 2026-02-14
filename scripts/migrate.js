#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const connectionString = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔗 Connecting to PostgreSQL database...');
  
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    // Read and execute migration file
    const migrationPath = join(__dirname, '..', 'database', 'init_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 Running database migration...');
    await pool.query(migrationSQL);
    
    console.log('✅ Database migration completed successfully');
    
    // Verify admin user exists
    const result = await pool.query(
      'SELECT email, name, role FROM users WHERE email = $1',
      ['admin@example.com']
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Admin user verified:', result.rows[0]);
    } else {
      console.log('⚠️  Warning: Admin user not found');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

runMigration();
