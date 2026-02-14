import { Pool, QueryResult } from 'pg';

// Create a singleton pool instance
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = import.meta.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : undefined,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { Pool, QueryResult };
