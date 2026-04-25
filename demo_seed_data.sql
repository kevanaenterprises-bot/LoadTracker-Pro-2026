-- ============================================================
-- LoadTracker Pro — Demo Seed Data
-- Run this in the Supabase SQL Editor for the demo project.
-- Creates realistic data across all views: drivers, customers,
-- shippers, receivers, loads (various statuses), and invoices.
-- ============================================================

-- -------------------------------------------------------
-- SETTINGS (demo company identity)
-- -------------------------------------------------------
INSERT INTO settings (key, value) VALUES
  ('company_name',               'Apex Freight LLC'),
  ('company_address',            '4821 Industrial Blvd'),
  ('company_city',               'Dallas'),
  ('company_state',              'TX'),
  ('company_zip',                '75207'),
  ('company_phone',              '214-555-0182'),
  ('company_email',              'billing@apexfreightllc.com'),
  ('invoice_prefix',             'APX'),
  ('invoice_start_number',       '1001'),
  ('invoice_notification_email', 'accounting@apexfreightllc.com'),
  ('auto_cc_email',              ''),
  ('auto_invoice_enabled',       'true'),
  ('auto_email_invoice',         'true'),
  ('payment_terms',              'Net 30')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- -------------------------------------------------------
-- DRIVERS
-- -------------------------------------------------------
INSERT INTO drivers (id, name, phone, email, truck_number, current_location, status, employment_status, hire_date, license_number, license_state, license_expiration, medical_card_expiration) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Marcus Johnson',   '214-555-0301', 'mjohnson@apexfreight.com',  'TX-441', 'Dallas, TX',      'available',  'active', '2021-03-15', 'TX-CDL-4412881', 'TX', '2027-03-15', '2026-09-15'),
  ('d1000000-0000-0000-0000-000000000002', 'Derrick Williams', '214-555-0302', 'dwilliams@apexfreight.com', 'TX-227', 'Fort Worth, TX',  'on_route',   'active', '2020-07-22', 'TX-CDL-2278843', 'TX', '2026-07-22', '2026-01-22'),
  ('d1000000-0000-0000-0000-000000000003', 'Sandra Reyes',     '214-555-0303', 'sreyes@apexfreight.com',    'TX-389', 'Houston, TX',     'available',  'active', '2022-01-10', 'TX-CDL-3891122', 'TX', '2027-01-10', '2026-07-10'),
  ('d1000000-0000-0000-0000-000000000004', 'Bobby Tran',       '214-555-0304', 'btran@apexfreight.com',     'TX-115', 'San Antonio, TX', 'available',  'active', '2019-11-05', 'TX-CDL-1150034', 'TX', '2025-11-05', '2025-11-05'),
  ('d1000000-0000-0000-0000-000000000005', 'Kevin Okafor',     '214-555-0305', 'kokafor@apexfreight.com',   'TX-558', 'Oklahoma City, OK','on_route',  'active', '2023-06-18', 'TX-CDL-5580991', 'TX', '2028-06-18', '2027-06-18')
ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- CUSTOMERS (bill-to brokers / shippers)
-- -------------------------------------------------------
INSERT INTO customers (id, company_name, contact_name, phone, billing_address, pod_email, has_fuel_surcharge, notes) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Lone Star Logistics',       'Amber Schultz',   '972-555-0201', '100 Commerce St, Dallas, TX 75202',        'dispatch@lonestarlogistics.com', true,  'Net 30. Requires signed BOL with every POD.'),
  ('c1000000-0000-0000-0000-000000000002', 'Gulf Coast Freight Brokers', 'Tony Marchetti',  '713-555-0202', '500 Travis St, Houston, TX 77002',          'invoices@gcfb.com',              true,  'Prefers PDF invoices. Quick pay available at 2%.'),
  ('c1000000-0000-0000-0000-000000000003', 'MidAmerica Transport Co',   'Rachel Nguyen',   '816-555-0203', '1 Main St Ste 400, Kansas City, MO 64105',  'billing@midamericatransport.com', false, 'Net 15. Fuel surcharge waived per contract.'),
  ('c1000000-0000-0000-0000-000000000004', 'Heartland Carriers LLC',    'James Kowalski',  '312-555-0204', '233 S Wacker Dr, Chicago, IL 60606',        'ap@heartlandcarriers.com',       true,  'High volume account. Invoices consolidated weekly.'),
  ('c1000000-0000-0000-0000-000000000005', 'Sunbelt Shipping Group',    'Diana Torres',    '480-555-0205', '2020 N Central Ave, Phoenix, AZ 85004',     'freight@sunbeltshipping.com',    false, 'Net 21. Southeast lanes only.')
ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- LOCATIONS — Shippers
-- -------------------------------------------------------
INSERT INTO locations (id, company_name, address, city, state, zip, contact_name, contact_phone, location_type, rate, latitude, longitude, notes) VALUES
  ('l1000000-0000-0000-0000-000000000001', 'Tyson Foods Distribution',       '4500 S Loop 12',          'Dallas',        'TX', '75241', 'Carl Bridges',   '214-555-0401', 'shipper', 0,    32.6877, -96.8336, 'Open Mon-Fri 6am-4pm. 2 dock doors.'),
  ('l1000000-0000-0000-0000-000000000002', 'Amazon Fulfillment DFW1',        '700 Westport Pkwy',       'Haslet',        'TX', '76052', 'Auto Receiving',  '817-555-0402', 'shipper', 0,    32.9712, -97.3441, 'Appointment required. Check in 30 min early.'),
  ('l1000000-0000-0000-0000-000000000003', 'Kimberly-Clark Manufacturing',   '2100 Winchester Rd',      'Neenah',        'WI', '54956', 'Shipping Dept',   '920-555-0403', 'shipper', 0,    44.1858, -88.4626, 'Hazmat certified dock. No drop & hook.'),
  ('l1000000-0000-0000-0000-000000000004', 'Pilgrim''s Pride Poultry',        '110 S Texas St',          'Pittsburg',     'TX', '75686', 'Lloyd Hampton',   '903-555-0404', 'shipper', 0,    32.9962, -94.9635, 'Refrigerated loads only. -20°F required.'),
  ('l1000000-0000-0000-0000-000000000005', 'Home Depot RDC South',           '5800 New World Dr',       'Haltom City',   'TX', '76117', 'Dock Manager',    '817-555-0405', 'shipper', 0,    32.8073, -97.2969, 'Live load only. 45 min window.'),
  ('l1000000-0000-0000-0000-000000000006', 'Whirlpool Regional Warehouse',   '3400 Dewalt Ave',         'Findlay',       'OH', '45840', 'Pat Novotny',     '419-555-0406', 'shipper', 0,    41.0534, -83.6499, 'Drop & hook available bay 7-12.')
ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- LOCATIONS — Receivers
-- -------------------------------------------------------
INSERT INTO locations (id, company_name, address, city, state, zip, contact_name, contact_phone, location_type, rate, latitude, longitude, notes) VALUES
  ('l2000000-0000-0000-0000-000000000001', 'Walmart DC #6097',               '1000 Walmart Way',        'Temple',        'TX', '76504', 'Receiving Dept',  '254-555-0501', 'receiver', 1850, 31.1177, -97.4161, 'Unload in 90 min or detention applies.'),
  ('l2000000-0000-0000-0000-000000000002', 'HEB Distribution Center',        '646 S Flores St',         'San Antonio',   'TX', '78204', 'Dock Control',    '210-555-0502', 'receiver', 2100, 29.4155, -98.4965, 'Must have food-grade trailer. FSMA compliant.'),
  ('l2000000-0000-0000-0000-000000000003', 'Target RDC Minneapolis',         '1000 Nicollet Mall',      'Minneapolis',   'MN', '55403', 'Auto Dock',       '612-555-0503', 'receiver', 3200, 44.9778, -93.2650, 'Blind receiver — no direct contact. Use carrier portal.'),
  ('l2000000-0000-0000-0000-000000000004', 'Lowe''s Distribution Center',    '1605 Curtis Bridge Rd',   'Wilkesboro',    'NC', '28697', 'Marcus Bell',     '336-555-0504', 'receiver', 2750, 36.1488, -81.1607, 'Flatbed unload only. Must have tarps.'),
  ('l2000000-0000-0000-0000-000000000005', 'Dollar General Dist. #19',       '15000 John J Delaney Dr', 'Bethel',        'PA', '19507', 'Night Receiving',  '717-555-0505', 'receiver', 2950, 40.4715, -76.2882, '24/7 receiving. Call 30 min prior to arrival.'),
  ('l2000000-0000-0000-0000-000000000006', 'Kroger Mid-Atlantic DC',         '3600 Patterson Ave SE',   'Roanoke',       'VA', '24013', 'Shipping Coord',  '540-555-0506', 'receiver', 2400, 37.2710, -79.9186, 'Grocery load — temp controlled 34-38°F.'),
  ('l2000000-0000-0000-0000-000000000007', 'AutoZone Regional DC',           '123 S Front St',          'Memphis',       'TN', '38103', 'Auto Receiving',  '901-555-0507', 'receiver', 1650, 35.1495, -90.0490, 'Palletized freight only. No floor loaded.')
ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- LOADS
-- statuses: UNASSIGNED, ASSIGNED, IN_TRANSIT, DELIVERED, INVOICED, PAID
-- -------------------------------------------------------
INSERT INTO loads (id, load_number, customer_id, driver_id, origin_address, origin_city, origin_state, dest_company, dest_address, dest_city, dest_state, pickup_date, delivery_date, cargo_description, weight, rate, status) VALUES

  -- UNASSIGNED (open, waiting for driver)
  ('a1000000-0000-0000-0000-000000000001',
   'LS-10041', 'c1000000-0000-0000-0000-000000000001', NULL,
   '4500 S Loop 12', 'Dallas', 'TX',
   'Walmart DC #6097', '1000 Walmart Way', 'Temple', 'TX',
   '2026-04-28', '2026-04-29',
   'Frozen Poultry — Temperature Controlled', 42000, 1850, 'UNASSIGNED'),

  ('a1000000-0000-0000-0000-000000000002',
   'GC-20088', 'c1000000-0000-0000-0000-000000000002', NULL,
   '700 Westport Pkwy', 'Haslet', 'TX',
   'HEB Distribution Center', '646 S Flores St', 'San Antonio', 'TX',
   '2026-04-29', '2026-04-30',
   'General Merchandise — Mixed Pallets', 38000, 2100, 'UNASSIGNED'),

  -- ASSIGNED (driver assigned, not yet picked up)
  ('a1000000-0000-0000-0000-000000000003',
   'LS-10042', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   '700 Westport Pkwy', 'Haslet', 'TX',
   'Dollar General Dist. #19', '15000 John J Delaney Dr', 'Bethel', 'PA',
   '2026-04-26', '2026-04-29',
   'Household Products — Dry Van', 44000, 2950, 'ASSIGNED'),

  ('a1000000-0000-0000-0000-000000000004',
   'MA-30014', 'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003',
   '5800 New World Dr', 'Haltom City', 'TX',
   'AutoZone Regional DC', '123 S Front St', 'Memphis', 'TN',
   '2026-04-26', '2026-04-27',
   'Auto Parts — Palletized', 31500, 1650, 'ASSIGNED'),

  -- IN_TRANSIT (driver on the road right now)
  ('a1000000-0000-0000-0000-000000000005',
   'GC-20089', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002',
   '110 S Texas St', 'Pittsburg', 'TX',
   'Kroger Mid-Atlantic DC', '3600 Patterson Ave SE', 'Roanoke', 'VA',
   '2026-04-24', '2026-04-26',
   'Refrigerated Produce — Temp 34°F', 40000, 2400, 'IN_TRANSIT'),

  ('a1000000-0000-0000-0000-000000000006',
   'HC-40033', 'c1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000005',
   '3400 Dewalt Ave', 'Findlay', 'OH',
   'Lowe''s Distribution Center', '1605 Curtis Bridge Rd', 'Wilkesboro', 'NC',
   '2026-04-23', '2026-04-25',
   'Appliances — Flatbed Tarped', 36000, 2750, 'IN_TRANSIT'),

  -- DELIVERED (POD submitted, pending invoice)
  ('a1000000-0000-0000-0000-000000000007',
   'LS-10039', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004',
   '4500 S Loop 12', 'Dallas', 'TX',
   'Target RDC Minneapolis', '1000 Nicollet Mall', 'Minneapolis', 'MN',
   '2026-04-20', '2026-04-22',
   'Retail Merchandise — Mixed Freight', 43500, 3200, 'DELIVERED'),

  -- INVOICED
  ('a1000000-0000-0000-0000-000000000008',
   'GC-20085', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
   '700 Westport Pkwy', 'Haslet', 'TX',
   'Walmart DC #6097', '1000 Walmart Way', 'Temple', 'TX',
   '2026-04-15', '2026-04-16',
   'General Merchandise — Dry Van', 39000, 1850, 'INVOICED'),

  ('a1000000-0000-0000-0000-000000000009',
   'MA-30011', 'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003',
   '2100 Winchester Rd', 'Neenah', 'WI',
   'Dollar General Dist. #19', '15000 John J Delaney Dr', 'Bethel', 'PA',
   '2026-04-12', '2026-04-14',
   'Paper Products — Full Truckload', 44500, 2950, 'INVOICED'),

  -- PAID
  ('a1000000-0000-0000-0000-000000000010',
   'HC-40028', 'c1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002',
   '5800 New World Dr', 'Haltom City', 'TX',
   'HEB Distribution Center', '646 S Flores St', 'San Antonio', 'TX',
   '2026-04-01', '2026-04-02',
   'Grocery — Temperature Controlled', 41000, 2100, 'PAID'),

  ('a1000000-0000-0000-0000-000000000011',
   'SB-50007', 'c1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000004',
   '4500 S Loop 12', 'Dallas', 'TX',
   'AutoZone Regional DC', '123 S Front St', 'Memphis', 'TN',
   '2026-03-28', '2026-03-29',
   'Auto Parts — Palletized Dry Van', 33000, 1650, 'PAID'),

  ('a1000000-0000-0000-0000-000000000012',
   'LS-10035', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005',
   '3400 Dewalt Ave', 'Findlay', 'OH',
   'Target RDC Minneapolis', '1000 Nicollet Mall', 'Minneapolis', 'MN',
   '2026-03-24', '2026-03-26',
   'Retail — Mixed Pallets', 40500, 3200, 'PAID')

ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- INVOICES (for INVOICED and PAID loads)
-- Statuses: PENDING = awaiting payment, PAID = collected
-- -------------------------------------------------------
INSERT INTO invoices (id, load_id, invoice_number, amount, status) VALUES

  ('i1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000008',
   'APX1001', 1850, 'PENDING'),

  ('i1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000009',
   'APX1002', 2950, 'PENDING'),

  ('i1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000010',
   'APX1003', 2100, 'PAID'),

  ('i1000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000011',
   'APX1004', 1650, 'PAID'),

  ('i1000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000012',
   'APX1005', 3200, 'PAID')

ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- LOAD STOPS (pickup + delivery for each load)
-- Covers the active/visible loads so stop details work
-- -------------------------------------------------------
INSERT INTO load_stops (load_id, stop_type, stop_sequence, company_name, address, city, state, zip, contact_name, contact_phone) VALUES

  -- Load LS-10041 (UNASSIGNED)
  ('a1000000-0000-0000-0000-000000000001', 'pickup',   1, 'Tyson Foods Distribution',  '4500 S Loop 12',      'Dallas',      'TX', '75241', 'Carl Bridges',  '214-555-0401'),
  ('a1000000-0000-0000-0000-000000000001', 'delivery', 1, 'Walmart DC #6097',           '1000 Walmart Way',    'Temple',      'TX', '76504', 'Receiving Dept','254-555-0501'),

  -- Load GC-20088 (UNASSIGNED)
  ('a1000000-0000-0000-0000-000000000002', 'pickup',   1, 'Amazon Fulfillment DFW1',   '700 Westport Pkwy',   'Haslet',      'TX', '76052', 'Auto Receiving','817-555-0402'),
  ('a1000000-0000-0000-0000-000000000002', 'delivery', 1, 'HEB Distribution Center',   '646 S Flores St',     'San Antonio', 'TX', '78204', 'Dock Control',  '210-555-0502'),

  -- Load LS-10042 (ASSIGNED — Marcus Johnson)
  ('a1000000-0000-0000-0000-000000000003', 'pickup',   1, 'Amazon Fulfillment DFW1',   '700 Westport Pkwy',   'Haslet',      'TX', '76052', 'Auto Receiving','817-555-0402'),
  ('a1000000-0000-0000-0000-000000000003', 'delivery', 1, 'Dollar General Dist. #19',  '15000 John J Delaney Dr','Bethel',   'PA', '19507', 'Night Receiving','717-555-0505'),

  -- Load MA-30014 (ASSIGNED — Sandra Reyes)
  ('a1000000-0000-0000-0000-000000000004', 'pickup',   1, 'Home Depot RDC South',      '5800 New World Dr',   'Haltom City', 'TX', '76117', 'Dock Manager',  '817-555-0405'),
  ('a1000000-0000-0000-0000-000000000004', 'delivery', 1, 'AutoZone Regional DC',      '123 S Front St',      'Memphis',     'TN', '38103', 'Auto Receiving','901-555-0507'),

  -- Load GC-20089 (IN_TRANSIT — Derrick Williams)
  ('a1000000-0000-0000-0000-000000000005', 'pickup',   1, 'Pilgrim''s Pride Poultry',  '110 S Texas St',      'Pittsburg',   'TX', '75686', 'Lloyd Hampton', '903-555-0404'),
  ('a1000000-0000-0000-0000-000000000005', 'delivery', 1, 'Kroger Mid-Atlantic DC',    '3600 Patterson Ave SE','Roanoke',    'VA', '24013', 'Shipping Coord','540-555-0506'),

  -- Load HC-40033 (IN_TRANSIT — Kevin Okafor)
  ('a1000000-0000-0000-0000-000000000006', 'pickup',   1, 'Whirlpool Regional Warehouse','3400 Dewalt Ave',   'Findlay',     'OH', '45840', 'Pat Novotny',   '419-555-0406'),
  ('a1000000-0000-0000-0000-000000000006', 'delivery', 1, 'Lowe''s Distribution Center','1605 Curtis Bridge Rd','Wilkesboro','NC', '28697', 'Marcus Bell',   '336-555-0504'),

  -- Load LS-10039 (DELIVERED — Bobby Tran)
  ('a1000000-0000-0000-0000-000000000007', 'pickup',   1, 'Tyson Foods Distribution',  '4500 S Loop 12',      'Dallas',      'TX', '75241', 'Carl Bridges',  '214-555-0401'),
  ('a1000000-0000-0000-0000-000000000007', 'delivery', 1, 'Target RDC Minneapolis',    '1000 Nicollet Mall',  'Minneapolis', 'MN', '55403', 'Auto Dock',     '612-555-0503')

ON CONFLICT DO NOTHING;
