import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import hereApi from './hereApi.js';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import dns from 'dns';

// Force IPv4 DNS resolution — Railway doesn't support IPv6 outbound (ENETUNREACH)
dns.setDefaultResultOrder('ipv4first');

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Initialize PostgreSQL pool
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined,
});

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set – database features will not work');
} else {
  console.log('✅ PostgreSQL pool initialized');
}

// JWT secret – required for auth
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set!');
  process.exit(1);
}

// bcrypt cost factor – configurable for resource-constrained environments
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// --- JWT authentication middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: true });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// --- Auth endpoints ---

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, role = 'driver' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    if (!['admin', 'driver'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or driver' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = uuidv4();

    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW()) RETURNING id, email, name, role, driver_id, is_active`,
      [userId, normalizedEmail, passwordHash, name, role]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        driver_id: user.driver_id,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const result = await pool.query(
      'SELECT id, email, password_hash, name, role, driver_id, is_active FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last_login (best-effort – do not fail login if this errors)
    pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])
      .catch((err) => console.error('Failed to update last_login:', err));

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        driver_id: user.driver_id,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Generic query endpoint (protected by JWT)
// WARNING: This endpoint should be replaced with specific authenticated endpoints in production
app.post('/api/query', authenticateToken, async (req, res) => {
  try {
    const { text, params } = req.body;
    
    // Basic validation
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid query' });
    }
    
    // Prevent dangerous operations (basic security - not comprehensive)
    const dangerousKeywords = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE USER', 'GRANT', 'REVOKE'];
    const upperQuery = text.toUpperCase();
    
    for (const keyword of dangerousKeywords) {
      if (upperQuery.includes(keyword)) {
        console.warn('Blocked dangerous query attempt:', keyword);
        return res.status(403).json({ error: 'Query contains dangerous operations' });
      }
    }
    
    // Check for multiple statements
    if (text.split(';').filter(s => s.trim()).length > 1) {
      return res.status(403).json({ error: 'Multiple statements not allowed' });
    }
    
    const result = await pool.query(text, params);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dedicated dashboard loads endpoint (protected by JWT)
app.get('/api/loads', authenticateToken, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         l.*, 
         row_to_json(c) AS customer,
         row_to_json(d) AS driver
       FROM loads l
       LEFT JOIN customers c ON c.id = l.customer_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       ORDER BY l.delivery_date ASC NULLS LAST, l.created_at DESC`
    );

    console.log(`[GET /api/loads] returned ${result.rows.length} rows`);
    res.json({ data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[GET /api/loads] error:', error);
    res.status(500).json({ error: 'Failed to fetch loads' });
  }
});

// HERE Maps API Endpoints

// Get HERE API configuration (returns API key for frontend maps)
// NOTE: This exposes the HERE API key to the frontend, which is necessary for client-side
// map rendering. Consider implementing server-side proxying for sensitive operations or
// using HERE's API key restrictions (domain allowlist, rate limits) to prevent abuse.
app.get('/api/here-config', (req, res) => {
  const apiKey = process.env.HERE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ 
      error: 'HERE_API_KEY not configured',
      message: 'HERE Maps API key is not set in environment variables' 
    });
  }
  res.json({ apiKey });
});

// Geocode an address
app.post('/api/geocode', async (req, res) => {
  try {
    const { address, city, state, zip } = req.body;
    
    if (!address && !city) {
      return res.status(400).json({ error: 'At least address or city is required' });
    }

    const result = await hereApi.geocodeAddress(address, city, state, zip);
    
    if (!result) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Return with success flag for compatibility
    res.json({
      success: true,
      latitude: result.latitude,
      longitude: result.longitude,
      formattedAddress: result.formattedAddress,
    });
  } catch (error) {
    console.error('Geocode error:', error);
    res.status(500).json({ error: error.message || 'Geocoding failed' });
  }
});

// Geocode an address and save to database
app.post('/api/geocode-and-save', authenticateToken, async (req, res) => {
  try {
    const { location_id, address, city, state, zip, geofence_radius } = req.body;
    
    if (!location_id) {
      return res.status(400).json({ error: 'location_id is required' });
    }

    if (!address && !city) {
      return res.status(400).json({ error: 'At least address or city is required' });
    }

    const result = await hereApi.geocodeAndSaveLocation(
      pool, 
      location_id, 
      address, 
      city, 
      state, 
      zip, 
      geofence_radius || 500
    );

    res.json(result);
  } catch (error) {
    console.error('Geocode and save error:', error);
    res.status(500).json({ error: error.message || 'Geocoding failed' });
  }
});

// Reverse geocode coordinates
app.post('/api/reverse-geocode', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const result = await hereApi.reverseGeocode(latitude, longitude);
    
    if (!result) {
      return res.status(404).json({ error: 'Address not found for coordinates' });
    }

    res.json(result);
  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({ error: error.message || 'Reverse geocoding failed' });
  }
});

// Calculate truck route
app.post('/api/calculate-route', async (req, res) => {
  try {
    const { waypoints } = req.body;
    
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ error: 'At least 2 waypoints are required' });
    }

    // Validate waypoint format
    for (const waypoint of waypoints) {
      if (!waypoint.lat || !waypoint.lng) {
        return res.status(400).json({ error: 'Each waypoint must have lat and lng properties' });
      }
    }

    const result = await hereApi.calculateTruckRoute(waypoints);
    
    if (!result) {
      return res.status(404).json({ error: 'No route found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Calculate route error:', error);
    res.status(500).json({ error: error.message || 'Route calculation failed' });
  }
});

// ─── Build a combined PDF: formatted invoice (page 1) + all POD docs ───────
async function buildInvoicePdf({ load, invoice, podDocuments, customer }) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const navy = rgb(0.07, 0.18, 0.42);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.92, 0.92, 0.92);

  const companyName = process.env.COMPANY_NAME || 'GO4 Freight Corp';
  const companyAddress = process.env.COMPANY_ADDRESS || '';
  const companyPhone = process.env.COMPANY_PHONE || '';
  const companyEmail = process.env.OUTLOOK_USER || '';
  const companyMC = process.env.COMPANY_MC || '';

  // ── Page 1: Invoice ──────────────────────────────────────────────────────
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 50;

  // Header bar
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: navy });
  page.drawText(companyName, { x: 30, y: height - 45, size: 22, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText('FREIGHT INVOICE', { x: width - 180, y: height - 45, size: 14, font: boldFont, color: rgb(1, 1, 1) });
  if (companyMC) page.drawText(`MC# ${companyMC}`, { x: 30, y: height - 65, size: 9, font, color: rgb(0.8, 0.85, 1) });

  y = height - 100;

  // Invoice meta block (right side)
  const metaX = width - 220;
  page.drawText('Invoice #:', { x: metaX, y, size: 10, font: boldFont, color: black });
  page.drawText(invoice.invoice_number || '', { x: metaX + 75, y, size: 10, font, color: black });
  y -= 16;
  page.drawText('Invoice Date:', { x: metaX, y, size: 10, font: boldFont, color: black });
  page.drawText(new Date().toLocaleDateString('en-US'), { x: metaX + 85, y, size: 10, font, color: black });
  y -= 16;
  page.drawText('Load #:', { x: metaX, y, size: 10, font: boldFont, color: black });
  page.drawText(load.load_number || '', { x: metaX + 55, y, size: 10, font, color: black });
  if (load.bol_number) {
    y -= 16;
    page.drawText('BOL #:', { x: metaX, y, size: 10, font: boldFont, color: black });
    page.drawText(load.bol_number, { x: metaX + 45, y, size: 10, font, color: black });
  }

  // Bill To block (left side)
  y = height - 100;
  page.drawText('BILL TO:', { x: 30, y, size: 9, font: boldFont, color: gray });
  y -= 16;
  page.drawText(customer.company_name || '', { x: 30, y, size: 12, font: boldFont, color: black });
  if (customer.billing_address) { y -= 14; page.drawText(customer.billing_address, { x: 30, y, size: 10, font, color: black }); }
  const cityLine = [customer.billing_city, customer.billing_state, customer.billing_zip].filter(Boolean).join(', ');
  if (cityLine) { y -= 14; page.drawText(cityLine, { x: 30, y, size: 10, font, color: black }); }
  if (customer.email) { y -= 14; page.drawText(customer.email, { x: 30, y, size: 9, font, color: gray }); }

  // Divider
  y = height - 210;
  page.drawRectangle({ x: 30, y, width: width - 60, height: 1, color: lightGray });
  y -= 20;

  // Shipment details section
  page.drawText('SHIPMENT DETAILS', { x: 30, y, size: 10, font: boldFont, color: navy });
  y -= 18;

  const col2 = 220, col3 = 400;
  const drawRow = (label, val, xBase = 30) => {
    if (!val && val !== 0) return;
    page.drawText(`${label}:`, { x: xBase, y, size: 9, font: boldFont, color: gray });
    page.drawText(String(val), { x: xBase + 110, y, size: 9, font, color: black });
  };

  const origin = [load.origin_address, load.origin_city, load.origin_state].filter(Boolean).join(', ');
  const dest = [load.dest_address || load.destination_address, load.dest_city, load.dest_state].filter(Boolean).join(', ');
  const destDisplay = dest || [load.dest_city, load.dest_state].filter(Boolean).join(', ');

  drawRow('Origin', origin || [load.origin_city, load.origin_state].filter(Boolean).join(', '));
  y -= 14;
  drawRow('Destination', destDisplay || load.dest_company);
  y -= 14;
  if (load.dest_company) { drawRow('Consignee', load.dest_company); y -= 14; }
  drawRow('Pickup Date', load.pickup_date ? new Date(load.pickup_date).toLocaleDateString('en-US') : null);
  y -= 14;
  drawRow('Delivery Date', load.delivery_date ? new Date(load.delivery_date).toLocaleDateString('en-US') : null);
  y -= 14;
  if (load.total_miles) { drawRow('Total Miles', `${Number(load.total_miles).toLocaleString()} mi`); y -= 14; }
  if (load.weight) { drawRow('Weight', `${Number(load.weight).toLocaleString()} lbs`); y -= 14; }
  if (load.cargo_description) { drawRow('Commodity', load.cargo_description); y -= 14; }

  // Divider
  y -= 10;
  page.drawRectangle({ x: 30, y, width: width - 60, height: 1, color: lightGray });
  y -= 20;

  // Charges table header
  page.drawRectangle({ x: 30, y: y - 4, width: width - 60, height: 18, color: navy });
  page.drawText('DESCRIPTION', { x: 40, y: y - 1, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText('AMOUNT', { x: width - 110, y: y - 1, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  y -= 22;

  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const chargeRows = [
    ['Line Haul', Number(load.rate || 0)],
  ];
  if (Number(load.extra_stop_fee || 0) > 0) chargeRows.push(['Extra Stop Fee', Number(load.extra_stop_fee)]);
  if (Number(load.lumper_fee || 0) > 0) chargeRows.push(['Lumper Fee', Number(load.lumper_fee)]);

  let subtotal = 0;
  for (const [desc, amt] of chargeRows) {
    subtotal += amt;
    page.drawText(desc, { x: 40, y, size: 10, font, color: black });
    page.drawText(fmt(amt), { x: width - 120, y, size: 10, font, color: black });
    y -= 18;
    page.drawRectangle({ x: 30, y, width: width - 60, height: 0.5, color: lightGray });
    y -= 8;
  }

  // Total amount due box
  y -= 10;
  page.drawRectangle({ x: width - 220, y: y - 6, width: 190, height: 28, color: navy });
  page.drawText('TOTAL AMOUNT DUE:', { x: width - 215, y: y + 4, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(fmt(invoice.amount || subtotal), { x: width - 100, y: y + 4, size: 12, font: boldFont, color: rgb(1, 1, 1) });

  y -= 50;

  // Payment / remittance note
  page.drawText('REMIT PAYMENT TO:', { x: 30, y, size: 9, font: boldFont, color: gray });
  y -= 14;
  page.drawText(companyName, { x: 30, y, size: 10, font: boldFont, color: black });
  if (companyAddress) { y -= 12; page.drawText(companyAddress, { x: 30, y, size: 9, font, color: black }); }
  if (companyPhone || companyEmail) {
    y -= 12;
    page.drawText([companyPhone, companyEmail].filter(Boolean).join('  |  '), { x: 30, y, size: 9, font, color: gray });
  }

  // Footer
  if (podDocuments.length > 0) {
    y -= 30;
    page.drawText(`POD documents attached: ${podDocuments.length} file(s) follow on the next page(s).`, { x: 30, y, size: 9, font, color: gray });
  }

  // ── Pages 2+: POD documents (download all in parallel, then add pages in order) ──
  const podResults = await Promise.all(podDocuments.map(async (pod, i) => {
    if (!pod.file_url) return { i, pod, bytes: null, error: 'No URL' };
    try {
      const podFetchAbort = new AbortController();
      const podFetchTimeout = setTimeout(() => podFetchAbort.abort(), 10000);
      let resp;
      try {
        resp = await fetch(pod.file_url, { signal: podFetchAbort.signal });
      } finally {
        clearTimeout(podFetchTimeout);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bytes = await resp.arrayBuffer();
      return { i, pod, bytes, error: null };
    } catch (err) {
      return { i, pod, bytes: null, error: String(err) };
    }
  }));

  for (const { i, pod, bytes, error } of podResults) {
    if (error || !bytes) {
      const errPage = pdfDoc.addPage([612, 792]);
      errPage.drawText(`POD ${i + 1} could not be embedded: ${pod.file_name || ''}`, { x: 30, y: 740, size: 12, font: boldFont, color: rgb(0.8, 0.2, 0.2) });
      errPage.drawText((error || 'No data').slice(0, 200), { x: 30, y: 715, size: 9, font, color: gray });
      continue;
    }
    try {
      const lowerName = (pod.file_name || '').toLowerCase();
      const lowerType = (pod.file_type || '').toLowerCase();
      const isPdf = lowerType.includes('pdf') || lowerName.endsWith('.pdf');

      if (isPdf) {
        const srcPdf = await PDFDocument.load(bytes);
        const copied = await pdfDoc.copyPages(srcPdf, srcPdf.getPageIndices());
        copied.forEach((p) => pdfDoc.addPage(p));
      } else {
        const isPng = lowerType.includes('png') || lowerName.endsWith('.png');
        const podPage = pdfDoc.addPage([612, 792]);
        podPage.drawText(`POD ${i + 1}: ${pod.file_name || 'attachment'}`, { x: 30, y: 762, size: 10, font: boldFont, color: navy });
        podPage.drawText(`Load ${load.load_number}  |  Invoice ${invoice.invoice_number}`, { x: 30, y: 748, size: 8, font, color: gray });
        const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const maxW = 552, maxH = 700;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        const dw = image.width * scale, dh = image.height * scale;
        podPage.drawImage(image, { x: (612 - dw) / 2, y: 740 - dh, width: dw, height: dh });
      }
    } catch (err) {
      const errPage = pdfDoc.addPage([612, 792]);
      errPage.drawText(`POD ${i + 1} could not be embedded: ${pod.file_name || ''}`, { x: 30, y: 740, size: 12, font: boldFont, color: rgb(0.8, 0.2, 0.2) });
      errPage.drawText(String(err).slice(0, 200), { x: 30, y: 715, size: 9, font, color: gray });
    }
  }

  return Buffer.from(await pdfDoc.save());
}

// Send invoice email endpoint
app.post('/api/send-invoice-email', authenticateToken, async (req, res) => {
  try {
    const { load_id, additional_cc } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id is required' });

    console.log(`[Email] Building invoice PDF for load ${load_id}`);

    const loadResult = await pool.query(
      `SELECT id, load_number, customer_id, bol_number, origin_city, origin_state, origin_address,
              dest_city, dest_state, dest_address, dest_company, pickup_date, delivery_date,
              cargo_description, weight, rate, extra_stop_fee, lumper_fee, total_miles
       FROM loads WHERE id = $1`,
      [load_id]
    );
    if (loadResult.rows.length === 0) return res.status(404).json({ error: 'Load not found' });
    const load = loadResult.rows[0];

    const customerResult = await pool.query(
      'SELECT company_name, email, billing_address, billing_city, billing_state, billing_zip FROM customers WHERE id = $1',
      [load.customer_id]
    );
    if (customerResult.rows.length === 0 || !customerResult.rows[0].email)
      return res.status(400).json({ error: 'Customer email not configured' });
    const customer = customerResult.rows[0];

    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1',
      [load_id]
    );
    if (invoiceResult.rows.length === 0) return res.status(404).json({ error: 'Invoice not found for this load' });
    const invoice = invoiceResult.rows[0];

    const podResult = await pool.query(
      'SELECT id, file_name, file_url, file_type FROM pod_documents WHERE load_id = $1 ORDER BY uploaded_at ASC',
      [load_id]
    );
    const podDocuments = podResult.rows;

    const outlookUser = process.env.OUTLOOK_USER;
    const outlookPassword = process.env.OUTLOOK_PASSWORD;
    if (!outlookUser || !outlookPassword)
      return res.status(503).json({ error: 'Email credentials are not configured on the server' });

    const pdfBuffer = await buildInvoicePdf({ load, invoice, podDocuments, customer });
    const attachmentFileName = `Invoice-${invoice.invoice_number}-Load-${load.load_number}.pdf`;

    const ccList = additional_cc && Array.isArray(additional_cc) ? additional_cc.filter(Boolean) : [];
    const allRecipients = [customer.email, ...ccList].join(', ');
    const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: outlookUser, pass: outlookPassword },
      connectionTimeout: 15000,
      socketTimeout: 60000,
    });

    const mailOptions = {
      from: outlookUser,
      to: customer.email,
      cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      subject: `Invoice ${invoice.invoice_number} - Load ${load.load_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: #0f2d72; padding: 24px 30px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; color: #fff; font-size: 20px;">Invoice ${invoice.invoice_number}</h2>
            <p style="margin: 4px 0 0; color: #a5b4fc; font-size: 13px;">Load #${load.load_number}${load.bol_number ? '  |  BOL #' + load.bol_number : ''}</p>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px 30px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 16px;">Dear ${customer.company_name},</p>
            <p style="margin: 0 0 20px;">Please find your invoice and POD documents attached as a single PDF file.</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr style="background: #f1f5f9;">
                <td style="padding: 10px 14px; font-weight: bold; border: 1px solid #e2e8f0;">Invoice Amount</td>
                <td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${fmt(invoice.amount)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; font-weight: bold; border: 1px solid #e2e8f0;">Origin</td>
                <td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${[load.origin_city, load.origin_state].filter(Boolean).join(', ')}</td>
              </tr>
              <tr style="background: #f1f5f9;">
                <td style="padding: 10px 14px; font-weight: bold; border: 1px solid #e2e8f0;">Destination</td>
                <td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${[load.dest_city, load.dest_state].filter(Boolean).join(', ')}</td>
              </tr>
              ${load.pickup_date ? `<tr><td style="padding: 10px 14px; font-weight: bold; border: 1px solid #e2e8f0;">Pickup Date</td><td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${new Date(load.pickup_date).toLocaleDateString('en-US')}</td></tr>` : ''}
              ${load.delivery_date ? `<tr style="background: #f1f5f9;"><td style="padding: 10px 14px; font-weight: bold; border: 1px solid #e2e8f0;">Delivery Date</td><td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${new Date(load.delivery_date).toLocaleDateString('en-US')}</td></tr>` : ''}
              <tr><td style="padding: 10px 14px; font-weight: bold; border: 1px solid #e2e8f0;">POD Documents</td><td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${podDocuments.length} file(s) included in attachment</td></tr>
            </table>
            <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">The attached PDF contains the invoice followed by all POD documents.</p>
            <p style="margin: 0; font-size: 13px; color: #64748b;">Thank you for your business!</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: attachmentFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    console.log(`[Email] Sending invoice ${invoice.invoice_number} to: ${allRecipients} with ${podDocuments.length} POD(s)`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent successfully: ${info.messageId}`);

    await pool.query(
      'UPDATE invoices SET emailed_at = NOW(), emailed_to = $1 WHERE id = $2',
      [allRecipients, invoice.id]
    );

    res.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} sent to ${customer.email} with ${podDocuments.length} POD(s) attached`,
      emailed_to: allRecipients,
      load_id: load_id,
      invoice_number: invoice.invoice_number,
      messageId: info.messageId,
    });

  } catch (error) {
    console.error('Send email error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to send invoice email' });
  }
});

// Public endpoint for driver portal auto-invoicing (token-scoped to the load)
app.post('/api/send-invoice-email/public', async (req, res) => {
  try {
    const { load_id, acceptance_token, additional_cc } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id is required' });
    if (!acceptance_token) return res.status(401).json({ error: 'acceptance_token is required' });

    const validate = await pool.query(
      'SELECT id FROM loads WHERE id = $1 AND acceptance_token = $2',
      [load_id, acceptance_token]
    );
    if (validate.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid token for this load' });
    }

    // Reuse the same protected endpoint logic
    const fakeReq = { body: { load_id, additional_cc }, headers: {} };
    const loadResult = await pool.query(
      `SELECT id, load_number, customer_id, bol_number, origin_city, origin_state, origin_address,
              dest_city, dest_state, dest_address, dest_company, pickup_date, delivery_date,
              cargo_description, weight, rate, extra_stop_fee, lumper_fee, total_miles
       FROM loads WHERE id = $1`,
      [load_id]
    );
    if (loadResult.rows.length === 0) return res.status(404).json({ error: 'Load not found' });
    const load = loadResult.rows[0];

    const customerResult = await pool.query(
      'SELECT company_name, email, billing_address, billing_city, billing_state, billing_zip FROM customers WHERE id = $1',
      [load.customer_id]
    );
    if (customerResult.rows.length === 0 || !customerResult.rows[0].email)
      return res.status(400).json({ error: 'Customer email not configured' });
    const customer = customerResult.rows[0];

    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1',
      [load_id]
    );
    if (invoiceResult.rows.length === 0) return res.status(404).json({ error: 'Invoice not found for this load' });
    const invoice = invoiceResult.rows[0];

    const podResult = await pool.query(
      'SELECT id, file_name, file_url, file_type FROM pod_documents WHERE load_id = $1 ORDER BY uploaded_at ASC',
      [load_id]
    );
    const podDocuments = podResult.rows;

    const outlookUser = process.env.OUTLOOK_USER;
    const outlookPassword = process.env.OUTLOOK_PASSWORD;
    if (!outlookUser || !outlookPassword)
      return res.status(503).json({ error: 'Email credentials are not configured on the server' });

    const pdfBuffer = await buildInvoicePdf({ load, invoice, podDocuments, customer });
    const attachmentFileName = `Invoice-${invoice.invoice_number}-Load-${load.load_number}.pdf`;
    const ccList = Array.isArray(additional_cc) ? additional_cc.filter(Boolean) : [];
    const allRecipients = [customer.email, ...ccList].join(', ');

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com', port: 587, secure: false,
      auth: { user: outlookUser, pass: outlookPassword },
      connectionTimeout: 15000,
      socketTimeout: 60000,
    });
    const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    await transporter.sendMail({
      from: outlookUser, to: customer.email,
      cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      subject: `Invoice ${invoice.invoice_number} - Load ${load.load_number}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2>Invoice ${invoice.invoice_number}</h2><p>Dear ${customer.company_name},</p><p>Please find your invoice and POD documents attached.</p><p><strong>Amount Due: ${fmt(invoice.amount)}</strong></p><p>Thank you for your business!</p></div>`,
      attachments: [{ filename: attachmentFileName, content: pdfBuffer, contentType: 'application/pdf' }],
    });

    await pool.query('UPDATE invoices SET emailed_at = NOW(), emailed_to = $1 WHERE id = $2', [allRecipients, invoice.id]);

    res.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} sent to ${customer.email} with ${podDocuments.length} POD(s) attached`,
      emailed_to: allRecipients,
    });
  } catch (error) {
    console.error('Public send email error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to send invoice email' });
  }
});

// Start server
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from React build
app.use(express.static(join(__dirname, '../dist')));

// Catch-all handler - send React app for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});
app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});
