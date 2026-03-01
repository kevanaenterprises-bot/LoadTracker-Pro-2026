const https = require('https');
const fs = require('fs');
const { Pool } = require('pg');
const copyFrom = require('pg-copy-streams').from;

// --- Configuration ---
const SUPABASE_URL = 'https://tlksfrowyjprvjerydrp.databasepad.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImZlMDM0ZDk3LWI2ZjctNGMzYy1hNjk5LWNlZDVlMDY1NjQxMCJ9.eyJwcm9qZWN0SWQiOiJ0bGtzZnJvd3lqcHJ2amVyeWRycCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcwMjQxMjY3LCJleHAiOjIwODU2MDEyNjcsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.yONwNzlthOzRbUbS6YaOJpx3YAO94QiSLCaue3NqjXo';
const RAILWAY_DB_URL = process.env.DATABASE_URL;

// Tables to migrate in order of dependency
const TABLES_TO_MIGRATE = [
  'customers',
  'drivers',
  'locations',
  'rate_matrix',
  'loads',
  'load_stops',
  'invoices',
  'payments',
  'pod_documents',
  'users',
  'destinations',
];

if (!RAILWAY_DB_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.');
  console.error('Please set it to your Railway PostgreSQL connection string.');
  process.exit(1);
}

// --- Helper Functions ---

function isValidUUID(str) {
    return typeof str === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

function jsonToCsv(json_data) {
    if (!json_data || json_data.length === 0) {
        return '';
    }
    // Filter out non-data rows (e.g. UI action button artifacts like edit/delete icons)
    // that may appear as the last row — keep only rows with a valid UUID id field.
    const filteredData = json_data.filter(row => {
        if (row.id !== undefined) {
            return isValidUUID(row.id);
        }
        // If the row has no id column, keep it only if it has at least one non-null value
        return Object.values(row).some(v => v !== null && v !== undefined && v !== '');
    });
    if (filteredData.length === 0) {
        return '';
    }
    const keys = Object.keys(filteredData[0]);
    const header = keys.join(',');
    const rows = filteredData.map(row => {
        return keys.map(key => {
            let value = row[key];
            if (value === null || value === undefined) {
                return '';
            }
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });
    return [header, ...rows].join('\n');
}

function downloadTableAsCsv(table) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: `/rest/v1/${table}?select=*`,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept': 'application/json',
      },
    };

    const req = https.get(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${table}. Status: ${res.statusCode} ${res.statusMessage}`));
      }
      
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(rawData);
          if (!Array.isArray(jsonData) || jsonData.length === 0) {
            console.log(`🟡 No data returned for ${table}. Skipping.`);
            resolve(null);
            return;
          }
          // Count rows that would be filtered (non-UUID id = UI artifacts like edit/delete icons)
          const validCount = jsonData.filter(row => row.id === undefined || isValidUUID(row.id)).length;
          if (validCount < jsonData.length) {
            console.log(`  ⚠️  Skipped ${jsonData.length - validCount} non-data row(s) in ${table} (likely UI button artifacts).`);
          }
          const csvData = jsonToCsv(jsonData);
          const filePath = `./${table}.csv`;
          fs.writeFileSync(filePath, csvData);
          console.log(`✅ Downloaded and converted ${table} to ${filePath}`);
          resolve(filePath);
        } catch (e) {
          reject(new Error(`Failed to parse JSON or convert to CSV for ${table}: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Error downloading ${table}: ${err.message}`));
    });
  });
}

async function importCsvToPostgres(pool, table, filePath) {
  if (!filePath) return;

  const client = await pool.connect();
  try {
    // Get the actual columns that exist in the Railway DB table
    const colResult = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    const dbColumns = colResult.rows.map(r => r.column_name);

    // Parse CSV header to find which columns we have in the source data
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const lines = csvContent.split('\n');
    const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Only keep columns that exist in both the CSV and the DB
    const columnsToImport = csvHeaders.filter(h => dbColumns.includes(h));
    const droppedColumns = csvHeaders.filter(h => !dbColumns.includes(h));

    if (droppedColumns.length > 0) {
      console.log(`  ⚠️  Dropping ${droppedColumns.length} column(s) not in Railway DB: ${droppedColumns.join(', ')}`);
    }

    // Rebuild the CSV with only the valid columns
    const colIndexes = columnsToImport.map(c => csvHeaders.indexOf(c));

    function parseCsvLine(line) {
      const result = [];
      let inQuotes = false, current = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
          result.push(current); current = '';
        } else {
          current += ch;
        }
      }
      result.push(current);
      return result;
    }

    function toCsvField(val) {
      if (val == null) return '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }

    const filteredLines = [columnsToImport.join(',')];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const fields = parseCsvLine(lines[i]);
      filteredLines.push(colIndexes.map(idx => toCsvField(fields[idx] ?? '')).join(','));
    }
    const filteredCsv = filteredLines.join('\n');

    console.log(`  - Clearing table: ${table}...`);
    await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);

    console.log(`  - Importing ${filePath} into ${table} (${columnsToImport.length} columns)...`);

    const colList = columnsToImport.map(c => `"${c}"`).join(', ');
    const stream = client.query(copyFrom(`COPY "${table}" (${colList}) FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER ',')`));

    await new Promise((resolve, reject) => {
      const { Readable } = require('stream');
      const readable = Readable.from([filteredCsv]);
      readable.on('error', reject);
      stream.on('error', reject);
      stream.on('finish', resolve);
      readable.pipe(stream);
    });

    console.log(`  - Successfully imported data for ${table}.`);
  } finally {
    client.release();
  }
}

async function migrate() {
  console.log('🚀 Starting data migration from Supabase to Railway...');
  
  const downloadedFiles = [];
  const pool = new Pool({ connectionString: RAILWAY_DB_URL });

  try {
    console.log('\n--- Step 1: Downloading data from Supabase ---');
    for (const table of TABLES_TO_MIGRATE) {
      const filePath = await downloadTableAsCsv(table);
      if (filePath) {
        downloadedFiles.push({ table, filePath });
      }
    }

    console.log('\n--- Step 2: Importing data into Railway PostgreSQL ---');
    for (const { table, filePath } of downloadedFiles) {
      await importCsvToPostgres(pool, table, filePath);
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    console.log('\n--- Step 3: Cleaning up temporary files ---');
    for (const { filePath } of downloadedFiles) {
      try {
        fs.unlinkSync(filePath);
        console.log(`  - Deleted ${filePath}`);
      } catch (err) {
        console.error(`  - Failed to delete ${filePath}: ${err.message}`);
      }
    }
    await pool.end();
  }
}

migrate();
