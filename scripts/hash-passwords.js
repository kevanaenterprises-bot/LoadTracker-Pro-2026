#!/usr/bin/env node
/**
 * Password Migration Script
 *
 * Hashes any plaintext passwords stored in the `users` table.
 * Safe to run multiple times – already-hashed passwords (starting with "$2") are skipped.
 *
 * Usage:
 *   DATABASE_URL=<your-railway-url> node scripts/hash-passwords.js
 *
 * WARNING: Back up your database before running this script.
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function hashPasswords() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');

    // Fetch all users
    const { rows: users } = await pool.query(
      'SELECT id, email, password_hash FROM users',
    );

    console.log(`📋 Found ${users.length} user(s) to check`);

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      const hash = user.password_hash;

      // Already a bcrypt hash – skip
      if (hash && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'))) {
        skipped++;
        continue;
      }

      if (!hash || hash === 'supabase_auth' || hash === '') {
        console.warn(`⚠️  User ${user.email} has no usable password – setting placeholder. They will need a password reset.`);
        // Set a locked/unusable hash so bcrypt.compare will always fail
        const unusable = await bcrypt.hash(`UNUSABLE_${Date.now()}_${user.id}`, 12);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [unusable, user.id]);
        migrated++;
        continue;
      }

      // Plaintext password – hash it
      const newHash = await bcrypt.hash(hash, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      console.log(`  🔒 Hashed password for ${user.email}`);
      migrated++;
    }

    console.log(`\n✅ Migration complete:`);
    console.log(`   Hashed/updated: ${migrated}`);
    console.log(`   Already hashed: ${skipped}`);

    if (migrated > 0) {
      console.log('\n⚠️  IMPORTANT: Users with plaintext passwords have been hashed.');
      console.log('   They can now log in with their original password.');
      console.log('   Users with "UNUSABLE" passwords must reset via admin.');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

hashPasswords();
