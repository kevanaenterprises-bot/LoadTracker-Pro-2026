#!/usr/bin/env node
/**
 * One-time migration: Download POD files from old Supabase URLs
 * and re-upload them to the new Supabase storage bucket,
 * then update the database records with the new URLs.
 *
 * Usage:
 *   DATABASE_URL="your-railway-postgres-url" node scripts/migrate-pods-to-new-supabase.js
 */

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;

const NEW_SUPABASE_URL = 'https://qekevyqhwxqyypmhjobd.supabase.co';
// Use service role key (bypasses RLS) — get from Supabase → Settings → API → service_role
const NEW_SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFla2V2eXFod3hxeXlwbWhqb2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTUwNDEsImV4cCI6MjA4NjU5MTA0MX0.YXbIJG5F1nSB9obbuLkhINPcPyznCc4VpZhWuP70_BE';
const BUCKET = 'pod-documents';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Usage: DATABASE_URL="postgresql://..." node scripts/migrate-pods-to-new-supabase.js');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const supabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_ANON_KEY);

async function migratePods() {
  console.log('🔗 Connecting to Railway Postgres...');
  await pool.query('SELECT NOW()');
  console.log('✅ Connected\n');

  // Fetch all POD records
  const { rows } = await pool.query(
    'SELECT id, load_id, file_name, file_url, file_type FROM pod_documents ORDER BY uploaded_at ASC'
  );
  console.log(`📋 Found ${rows.length} POD record(s) to migrate\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const pod of rows) {
    // Skip records already pointing to new Supabase
    if (pod.file_url && pod.file_url.includes('qekevyqhwxqyypmhjobd')) {
      console.log(`⏭️  Skipping (already migrated): ${pod.file_name}`);
      skipped++;
      continue;
    }

    if (!pod.file_url) {
      console.log(`⚠️  Skipping (no URL): ${pod.file_name}`);
      skipped++;
      continue;
    }

    console.log(`⬇️  Downloading: ${pod.file_name}`);
    try {
      // Download from old URL
      const resp = await fetch(pod.file_url);
      if (!resp.ok) {
        console.error(`   ❌ Download failed (HTTP ${resp.status}): ${pod.file_url}`);
        failed++;
        continue;
      }
      const buffer = await resp.arrayBuffer();
      const fileBytes = new Uint8Array(buffer);

      // Build storage path: load_id/timestamp.ext
      const ext = pod.file_name.split('.').pop() || 'jpg';
      const storagePath = `${pod.load_id}/${pod.id}.${ext}`;

      console.log(`   ⬆️  Uploading to new Supabase: ${storagePath}`);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBytes, {
          contentType: pod.file_type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error(`   ❌ Upload failed: ${uploadError.message}`);
        failed++;
        continue;
      }

      // Get new public URL
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const newUrl = urlData.publicUrl;

      // Update database record
      await pool.query('UPDATE pod_documents SET file_url = $1 WHERE id = $2', [newUrl, pod.id]);
      console.log(`   ✅ Done: ${newUrl}`);
      success++;

    } catch (err) {
      console.error(`   ❌ Error processing ${pod.file_name}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=============================');
  console.log(`✅ Migrated:  ${success}`);
  console.log(`⏭️  Skipped:   ${skipped}`);
  console.log(`❌ Failed:    ${failed}`);
  console.log('=============================');

  await pool.end();
}

migratePods().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
