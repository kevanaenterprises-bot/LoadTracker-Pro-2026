/**
 * Seed historical_markers from OpenStreetMap Overpass API
 * Pulls historic=memorial, historic=marker, tourism=attraction with historic tags
 * Runs by state to avoid timeouts — can be re-run safely (upserts)
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],
  ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],
  ['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
  ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
  ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
  ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
  ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],
  ['WI','Wisconsin'],['WY','Wyoming'],['DC','District of Columbia'],
];

// State abbreviation -> 2-letter code lookup by name
const STATE_BY_NAME = Object.fromEntries(US_STATES.map(([abbr, name]) => [name.toLowerCase(), abbr]));
const STATE_BY_ABBR = Object.fromEntries(US_STATES.map(([abbr, name]) => [abbr, abbr]));

function getStateAbbr(addrState) {
  if (!addrState) return null;
  const s = addrState.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_BY_NAME[s.toLowerCase()] || null;
}

async function fetchMarkersForState(stateAbbr, stateName) {
  const query = `
[out:json][timeout:60];
area["name"="${stateName}"]["boundary"="administrative"]["admin_level"="4"]->.state;
(
  node["historic"="marker"](area.state);
  node["historic"="memorial"](area.state);
  node["historic"="wayside_exhibit"](area.state);
  node["information"="board"]["historic"](area.state);
);
out body 2000;
`.trim();

  const url = `https://overpass-api.de/api/interpreter`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.elements || [];
}

async function upsertMarkers(elements, stateAbbr) {
  let inserted = 0;
  let skipped = 0;

  for (const el of elements) {
    if (!el.lat || !el.lon) { skipped++; continue; }
    const tags = el.tags || {};

    const title = tags.name || tags['name:en'] || tags.inscription?.slice(0, 100) || 'Historical Marker';
    if (title.length < 3) { skipped++; continue; }

    const description = tags.inscription || tags.description || tags.note ||
      `${tags.historic || 'Historical marker'} in ${tags['addr:city'] || ''} ${stateAbbr}`.trim();

    const city = tags['addr:city'] || tags.city || '';
    const county = tags['addr:county'] || '';
    const state = getStateAbbr(tags['addr:state']) || stateAbbr;
    const markerId = `osm-${el.id}`;

    let yearErected = null;
    if (tags.start_date) {
      const y = parseInt(tags.start_date);
      if (y > 1600 && y <= new Date().getFullYear()) yearErected = y;
    }

    const erectedBy = tags.operator || tags['operated_by'] || tags.owner || null;

    try {
      await pool.query(
        `INSERT INTO historical_markers
           (id, marker_id, title, subtitle, description, latitude, longitude, city, state, county, year_erected, erected_by)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (marker_id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           city = EXCLUDED.city,
           state = EXCLUDED.state`,
        [markerId, title, tags.subtitle || null, description,
         el.lat, el.lon, city, state, county, yearErected, erectedBy]
      );
      inserted++;
    } catch (e) {
      skipped++;
    }
  }
  return { inserted, skipped };
}

async function main() {
  console.log('🗺️  Seeding historical markers from OpenStreetMap...\n');

  // Check current count
  const before = await pool.query('SELECT COUNT(*) as c FROM historical_markers');
  console.log(`Current markers in DB: ${before.rows[0].c}`);

  // Find which states already have data
  const existing = await pool.query('SELECT DISTINCT state FROM historical_markers');
  const doneStates = new Set(existing.rows.map(r => r.state));
  console.log(`Already seeded: ${[...doneStates].join(', ') || 'none'}\n`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let statesDone = 0;

  for (const [abbr, name] of US_STATES) {
    if (doneStates.has(abbr)) {
      console.log(`  ${abbr} — already seeded, skipping`);
      continue;
    }
    try {
      process.stdout.write(`  ${abbr} (${name})... `);
      const elements = await fetchMarkersForState(abbr, name);
      const { inserted, skipped } = await upsertMarkers(elements, abbr);
      totalInserted += inserted;
      totalSkipped += skipped;
      statesDone++;
      console.log(`${elements.length} found, ${inserted} upserted, ${skipped} skipped`);

      // Be polite to Overpass API — 1s between states
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log(`❌ Error: ${e.message} — skipping`);
      await new Promise(r => setTimeout(r, 3000)); // back off on error
    }
  }

  const after = await pool.query('SELECT COUNT(*) as c FROM historical_markers');
  console.log(`\n✅ Done! ${statesDone} states processed`);
  console.log(`   Upserted: ${totalInserted} | Skipped: ${totalSkipped}`);
  console.log(`   Total markers in DB: ${after.rows[0].c}`);

  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
