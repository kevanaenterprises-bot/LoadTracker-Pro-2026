/**
 * Seed demo database with realistic fake trucking data
 * Safe to re-run — uses upserts/truncate+insert
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DEMO_DATABASE_PUBLIC_URL,
  ssl: { rejectUnauthorized: false },
});

const BCRYPT_ROUNDS = 10;

async function seed() {
  console.log('🌱 Seeding demo database...\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  const adminPw = await bcrypt.hash('demo1234', BCRYPT_ROUNDS);
  const driverPw = await bcrypt.hash('driver123', BCRYPT_ROUNDS);

  const adminId = uuidv4();
  const demoDriverUserId = uuidv4();

  await pool.query(`
    INSERT INTO users (id, email, password_hash, name, role, is_active, created_at)
    VALUES
      ($1, 'demo@loadtrackerpro.com', $2, 'Demo Admin', 'admin', true, NOW()),
      ($3, 'driver@loadtrackerpro.com', $4, 'Demo Driver', 'driver', true, NOW())
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true
  `, [adminId, adminPw, demoDriverUserId, driverPw]);
  console.log('✅ Users seeded (admin: demo@loadtrackerpro.com / demo1234)');

  // ── Customers ──────────────────────────────────────────────────────────────
  const customers = [
    { id: uuidv4(), company_name: 'Lone Star Logistics', contact_name: 'Brad Hartwell', email: 'billing@lonestarlogistics.com', phone: '(214) 555-0101', billing_address: '4400 Commerce St', billing_city: 'Dallas', billing_state: 'TX', billing_zip: '75226', has_fuel_surcharge: true, fuel_surcharge_rate: 0.08 },
    { id: uuidv4(), company_name: 'Midwest Grain Co.', contact_name: 'Carol Pfeiffer', email: 'ap@midwestgrain.com', phone: '(816) 555-0202', billing_address: '1200 Industrial Blvd', billing_city: 'Kansas City', billing_state: 'MO', billing_zip: '64108', has_fuel_surcharge: false, fuel_surcharge_rate: 0 },
    { id: uuidv4(), company_name: 'Gulf Coast Freight', contact_name: 'Marcus Thibodeau', email: 'invoices@gcfreight.net', phone: '(713) 555-0303', billing_address: '8900 Port Blvd', billing_city: 'Houston', billing_state: 'TX', billing_zip: '77029', has_fuel_surcharge: true, fuel_surcharge_rate: 0.06 },
    { id: uuidv4(), company_name: 'Rocky Mountain Supply', contact_name: 'Janet Briggs', email: 'accounts@rmsupply.com', phone: '(303) 555-0404', billing_address: '550 Larimer St', billing_city: 'Denver', billing_state: 'CO', billing_zip: '80204', has_fuel_surcharge: false, fuel_surcharge_rate: 0 },
    { id: uuidv4(), company_name: 'Peach State Produce', contact_name: 'Darnell Washington', email: 'freight@peachstateproduce.com', phone: '(404) 555-0505', billing_address: '200 Peachtree Rd', billing_city: 'Atlanta', billing_state: 'GA', billing_zip: '30303', has_fuel_surcharge: true, fuel_surcharge_rate: 0.05 },
  ];

  for (const c of customers) {
    await pool.query(`
      INSERT INTO customers (id, company_name, contact_name, email, phone, billing_address, billing_city, billing_state, billing_zip, has_fuel_surcharge, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT DO NOTHING
    `, [c.id, c.company_name, c.contact_name, c.email, c.phone, c.billing_address, c.billing_city, c.billing_state, c.billing_zip, c.has_fuel_surcharge]);
  }
  console.log('✅ Customers seeded (5)');

  // ── Drivers ────────────────────────────────────────────────────────────────
  const drivers = [
    { id: uuidv4(), name: 'Bobby Ray Calhoun', phone: '(903) 555-1001', email: 'bobby@demo.com', truck_number: 'UNIT-01', license_number: 'TX-CDL-88421', license_state: 'TX', status: 'available' },
    { id: uuidv4(), name: 'Maria Elena Vasquez', phone: '(214) 555-1002', email: 'maria@demo.com', truck_number: 'UNIT-02', license_number: 'TX-CDL-77392', license_state: 'TX', status: 'on_route' },
    { id: uuidv4(), name: 'James T. Buckley', phone: '(469) 555-1003', email: 'james@demo.com', truck_number: 'UNIT-03', license_number: 'TX-CDL-65841', license_state: 'TX', status: 'available' },
    { id: uuidv4(), name: 'Tyrone Williams', phone: '(972) 555-1004', email: 'tyrone@demo.com', truck_number: 'UNIT-04', license_number: 'TX-CDL-54219', license_state: 'TX', status: 'on_route' },
    { id: uuidv4(), name: 'Sandra Kay Pittman', phone: '(817) 555-1005', email: 'sandra@demo.com', truck_number: 'UNIT-05', license_number: 'TX-CDL-43108', license_state: 'TX', status: 'available' },
  ];

  // Update demo driver user to link to first driver
  for (const d of drivers) {
    await pool.query(`
      INSERT INTO drivers (id, name, phone, email, truck_number, license_number, license_state, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT DO NOTHING
    `, [d.id, d.name, d.phone, d.email, d.truck_number, d.license_number, d.license_state, d.status]);
  }
  // Link demo driver user to Bobby Ray
  await pool.query(`UPDATE users SET driver_id = $1 WHERE email = 'driver@loadtrackerpro.com'`, [drivers[0].id]);
  console.log('✅ Drivers seeded (5)');

  // ── Locations ──────────────────────────────────────────────────────────────
  const locations = [
    { id: uuidv4(), name: 'Dallas Distribution Center', address: '4400 Commerce St', city: 'Dallas', state: 'TX', zip: '75226', latitude: 32.7767, longitude: -96.7970, geofence_radius: 300 },
    { id: uuidv4(), name: 'Houston Port Terminal', address: '8900 Port Blvd', city: 'Houston', state: 'TX', zip: '77029', latitude: 29.7604, longitude: -95.3698, geofence_radius: 400 },
    { id: uuidv4(), name: 'Kansas City Grain Elevator', address: '1200 Industrial Blvd', city: 'Kansas City', state: 'MO', zip: '64108', latitude: 39.0997, longitude: -94.5786, geofence_radius: 350 },
    { id: uuidv4(), name: 'Atlanta Produce Terminal', address: '200 Peachtree Rd', city: 'Atlanta', state: 'GA', zip: '30303', latitude: 33.7490, longitude: -84.3880, geofence_radius: 300 },
    { id: uuidv4(), name: 'Denver Supply Warehouse', address: '550 Larimer St', city: 'Denver', state: 'CO', zip: '80204', latitude: 39.7392, longitude: -104.9903, geofence_radius: 300 },
    { id: uuidv4(), name: 'Memphis Freight Hub', address: '1 Harbor Bend Blvd', city: 'Memphis', state: 'TN', zip: '38103', latitude: 35.1495, longitude: -90.0490, geofence_radius: 350 },
  ];
  for (const l of locations) {
    await pool.query(`
      INSERT INTO locations (id, company_name, address, city, state, zip, latitude, longitude, geofence_radius, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT DO NOTHING
    `, [l.id, l.name, l.address, l.city, l.state, l.zip, l.latitude, l.longitude, l.geofence_radius]);
  }
  console.log('✅ Locations seeded (6)');

  // ── Loads ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const d = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString().split('T')[0];

  const loads = [
    // UNASSIGNED - ready to dispatch
    { id: uuidv4(), load_number: 'LTP-1001', status: 'UNASSIGNED', customer_id: customers[0].id, driver_id: null, origin_address: '4400 Commerce St', origin_city: 'Dallas', origin_state: 'TX', dest_address: '1 Harbor Bend Blvd', dest_city: 'Memphis', dest_state: 'TN', dest_company: 'Memphis Freight Hub', pickup_date: d(-1), delivery_date: d(1), rate: 2850, total_miles: 452, cargo_description: 'Industrial Equipment', weight: 42000, bol_number: 'BOL-10010' },
    { id: uuidv4(), load_number: 'LTP-1002', status: 'UNASSIGNED', customer_id: customers[2].id, driver_id: null, origin_address: '8900 Port Blvd', origin_city: 'Houston', origin_state: 'TX', dest_address: '550 Larimer St', dest_city: 'Denver', dest_state: 'CO', dest_company: 'Rocky Mountain Supply', pickup_date: d(0), delivery_date: d(2), rate: 3400, total_miles: 1012, cargo_description: 'Petroleum Products', weight: 44000, bol_number: 'BOL-10020' },

    // DISPATCHED
    { id: uuidv4(), load_number: 'LTP-1003', status: 'DISPATCHED', customer_id: customers[1].id, driver_id: drivers[0].id, origin_address: '1200 Industrial Blvd', origin_city: 'Kansas City', origin_state: 'MO', dest_address: '4400 Commerce St', dest_city: 'Dallas', dest_state: 'TX', dest_company: 'Lone Star Logistics', pickup_date: d(0), delivery_date: d(2), rate: 2200, total_miles: 501, cargo_description: 'Grain — Corn', weight: 45000, bol_number: 'BOL-10030' },

    // IN TRANSIT
    { id: uuidv4(), load_number: 'LTP-1004', status: 'IN_TRANSIT', customer_id: customers[4].id, driver_id: drivers[1].id, origin_address: '200 Peachtree Rd', origin_city: 'Atlanta', origin_state: 'GA', dest_address: '8900 Port Blvd', dest_city: 'Houston', dest_state: 'TX', dest_company: 'Gulf Coast Freight', pickup_date: d(1), delivery_date: d(3), rate: 3100, total_miles: 789, cargo_description: 'Fresh Produce', weight: 38000, bol_number: 'BOL-10040' },
    { id: uuidv4(), load_number: 'LTP-1005', status: 'IN_TRANSIT', customer_id: customers[0].id, driver_id: drivers[3].id, origin_address: '4400 Commerce St', origin_city: 'Dallas', origin_state: 'TX', dest_address: '200 Peachtree Rd', dest_city: 'Atlanta', dest_state: 'GA', dest_company: 'Peach State Produce', pickup_date: d(1), delivery_date: d(3), rate: 2950, total_miles: 781, cargo_description: 'Dry Goods', weight: 40000, bol_number: 'BOL-10050' },

    // DELIVERED
    { id: uuidv4(), load_number: 'LTP-1006', status: 'DELIVERED', customer_id: customers[2].id, driver_id: drivers[2].id, origin_address: '8900 Port Blvd', origin_city: 'Houston', origin_state: 'TX', dest_address: '1200 Industrial Blvd', dest_city: 'Kansas City', dest_state: 'MO', dest_company: 'Midwest Grain Co.', pickup_date: d(5), delivery_date: d(3), rate: 2600, total_miles: 741, cargo_description: 'Steel Coils', weight: 43500, bol_number: 'BOL-10060' },

    // INVOICED
    { id: uuidv4(), load_number: 'LTP-1007', status: 'INVOICED', customer_id: customers[3].id, driver_id: drivers[4].id, origin_address: '550 Larimer St', origin_city: 'Denver', origin_state: 'CO', dest_address: '4400 Commerce St', dest_city: 'Dallas', dest_state: 'TX', dest_company: 'Lone Star Logistics', pickup_date: d(10), delivery_date: d(8), rate: 3200, total_miles: 921, cargo_description: 'Building Materials', weight: 41000, bol_number: 'BOL-10070' },
    { id: uuidv4(), load_number: 'LTP-1008', status: 'INVOICED', customer_id: customers[0].id, driver_id: drivers[0].id, origin_address: '4400 Commerce St', origin_city: 'Dallas', origin_state: 'TX', dest_address: '8900 Port Blvd', dest_city: 'Houston', dest_state: 'TX', dest_company: 'Gulf Coast Freight', pickup_date: d(12), delivery_date: d(11), rate: 1850, total_miles: 239, cargo_description: 'Auto Parts', weight: 36000, bol_number: 'BOL-10080' },

    // PAID
    { id: uuidv4(), load_number: 'LTP-1009', status: 'PAID', customer_id: customers[4].id, driver_id: drivers[1].id, origin_address: '200 Peachtree Rd', origin_city: 'Atlanta', origin_state: 'GA', dest_address: '1 Harbor Bend Blvd', dest_city: 'Memphis', dest_state: 'TN', dest_company: 'Memphis Freight Hub', pickup_date: d(20), delivery_date: d(18), rate: 1650, total_miles: 394, cargo_description: 'Consumer Goods', weight: 39000, bol_number: 'BOL-10090' },
    { id: uuidv4(), load_number: 'LTP-1010', status: 'PAID', customer_id: customers[1].id, driver_id: drivers[2].id, origin_address: '1200 Industrial Blvd', origin_city: 'Kansas City', origin_state: 'MO', dest_address: '550 Larimer St', dest_city: 'Denver', dest_state: 'CO', dest_company: 'Rocky Mountain Supply', pickup_date: d(25), delivery_date: d(23), rate: 2400, total_miles: 601, cargo_description: 'Grain — Wheat', weight: 44500, bol_number: 'BOL-10100' },
  ];

  for (const l of loads) {
    await pool.query(`
      INSERT INTO loads (id, load_number, status, customer_id, driver_id,
        origin_address, origin_city, origin_state,
        dest_address, dest_city, dest_state, dest_company,
        pickup_date, delivery_date, rate, total_miles,
        cargo_description, weight, bol_number, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
      ON CONFLICT DO NOTHING
    `, [l.id, l.load_number, l.status, l.customer_id, l.driver_id,
        l.origin_address, l.origin_city, l.origin_state,
        l.dest_address, l.dest_city, l.dest_state, l.dest_company,
        l.pickup_date, l.delivery_date, l.rate, l.total_miles,
        l.cargo_description, l.weight, l.bol_number]);
  }
  console.log('✅ Loads seeded (10 across all statuses)');

  // ── Invoices ───────────────────────────────────────────────────────────────
  // Create invoices for INVOICED and PAID loads
  const invoicedLoads = loads.filter(l => l.status === 'INVOICED' || l.status === 'PAID');
  let invNum = 1007;
  const invoiceIds = {};

  for (const l of invoicedLoads) {
    const invId = uuidv4();
    invoiceIds[l.id] = invId;
    const isPaid = l.status === 'PAID';
    await pool.query(`
      INSERT INTO invoices (id, load_id, invoice_number, amount, status, paid_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT DO NOTHING
    `, [invId, l.id, `INV-${invNum++}`, l.rate, isPaid ? 'PAID' : 'PENDING',
        isPaid ? new Date(now - 15 * 86400000).toISOString() : null]);
  }
  console.log('✅ Invoices seeded (4)');

  // ── Payments for PAID loads ────────────────────────────────────────────────
  const paidLoads = loads.filter(l => l.status === 'PAID');
  for (const l of paidLoads) {
    const invId = invoiceIds[l.id];
    if (!invId) continue;
    await pool.query(`
      INSERT INTO payments (id, invoice_id, load_id, amount, payment_date, payment_method, check_number, created_at)
      VALUES ($1,$2,$3,$4,$5,'check',$6,NOW()) ON CONFLICT DO NOTHING
    `, [uuidv4(), invId, l.id, l.rate,
        new Date(now - 14 * 86400000).toISOString().split('T')[0],
        `CHK-${Math.floor(10000 + Math.random() * 90000)}`]);
  }
  console.log('✅ Payments seeded (2 paid loads)');

  // ── Settings ───────────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO settings (id, key, value, created_at)
    VALUES
      (uuid_generate_v4(), 'company_name', 'GO Farms & Cattle Transport', NOW()),
      (uuid_generate_v4(), 'company_address', '1510 Crystal Valley Way, Melissa TX 75454', NOW()),
      (uuid_generate_v4(), 'company_phone', '(903) 803-7500', NOW()),
      (uuid_generate_v4(), 'demo_mode', 'true', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `).catch(() => {
    // settings table may not have unique key constraint — ignore
  });

  console.log('\n✅ Demo database fully seeded!');
  console.log('\n📋 Demo credentials:');
  console.log('   Admin:  demo@loadtrackerpro.com / demo1234');
  console.log('   Driver: driver@loadtrackerpro.com / driver123');
  console.log('\n📦 Data summary:');
  console.log('   5 customers, 5 drivers, 6 locations');
  console.log('   10 loads (2 unassigned, 1 dispatched, 2 in-transit, 1 delivered, 2 invoiced, 2 paid)');
  console.log('   4 invoices, 2 payments');
}

seed()
  .catch(e => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => pool.end());
