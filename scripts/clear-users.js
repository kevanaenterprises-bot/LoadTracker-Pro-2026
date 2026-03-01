import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function clearUsers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    console.log('🗑️  Connecting to database...');
    
    // Delete all users
    const result = await pool.query('DELETE FROM users');
    
    console.log(`✅ Deleted ${result.rowCount} user(s) from the database`);
    console.log('🎉 Database cleared! You can now create a fresh account.');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    
    if (error.code === '42P01') {
      console.log('ℹ️  Users table does not exist yet - that\'s OK!');
    }
  } finally {
    await pool.end();
    process.exit(0);
  }
}

clearUsers();
