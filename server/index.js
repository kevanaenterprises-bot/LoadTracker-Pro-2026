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

const DEFAULT_ALWAYS_CC = (process.env.INVOICE_ALWAYS_CC || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function uniqueEmails(emails = []) {
  const seen = new Set();
  const valid = [];
  for (const email of emails) {
    if (!email || typeof email !== 'string') continue;
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    valid.push(normalized);
  }
  return valid;
}

async function fetchCompanySettings() {
  const keys = ['company_name', 'company_email', 'company_phone'];
  const result = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys]);
  const settings = {};
  for (const row of result.rows) settings[row.key] = row.value;
  return {
    companyName: settings.company_name || 'Turtle Logistics LLC',
    companyEmail: settings.company_email || process.env.OUTLOOK_USER || 'dispatch@turtlelogisticsllc.com',
    companyPhone: settings.company_phone || 'N/A',
  };
}

async function buildCombinedAttachmentPdf({ load, invoice, podDocuments, customer, company }) {
  const pdfDoc = await PDFDocument.create();
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const firstPage = pdfDoc.addPage([612, 792]);
  firstPage.drawText(company.companyName, { x: 50, y: 740, size: 20, font: titleFont, color: rgb(0.1, 0.2, 0.6) });
  firstPage.drawText(`Invoice ${invoice.invoice_number}`, { x: 50, y: 700, size: 18, font: titleFont });
  firstPage.drawText(`Load Number: ${load.load_number || 'N/A'}`, { x: 50, y: 670, size: 12, font: bodyFont });
  firstPage.drawText(`BOL/POD Number: ${load.bol_number || 'N/A'}`, { x: 50, y: 650, size: 12, font: bodyFont });
  firstPage.drawText(`Customer: ${customer.company_name || 'N/A'}`, { x: 50, y: 630, size: 12, font: bodyFont });
  firstPage.drawText(`Amount Due: $${Number(invoice.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { x: 50, y: 610, size: 12, font: bodyFont });
  firstPage.drawText(`Generated: ${new Date().toLocaleString()}`, { x: 50, y: 590, size: 10, font: bodyFont });
  firstPage.drawText(`POD Attachments Included: ${podDocuments.length}`, { x: 50, y: 560, size: 12, font: titleFont });

  for (const [index, pod] of podDocuments.entries()) {
    if (!pod.file_url) continue;

    try {
      const response = await fetch(pod.file_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const lowerName = (pod.file_name || '').toLowerCase();
      const lowerType = (pod.file_type || '').toLowerCase();
      const isPdf = lowerType.includes('pdf') || lowerName.endsWith('.pdf') || pod.file_url.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        const sourcePdf = await PDFDocument.load(bytes);
        const pages = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());
        pages.forEach((page) => pdfDoc.addPage(page));
        continue;
      }

      const isPng = lowerType.includes('png') || lowerName.endsWith('.png') || pod.file_url.toLowerCase().includes('.png');
      const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      const page = pdfDoc.addPage([612, 792]);
      const title = `POD ${index + 1}: ${pod.file_name || 'attachment'}`;
      page.drawText(title.slice(0, 90), { x: 40, y: 760, size: 11, font: bodyFont });

      const maxWidth = 540;
      const maxHeight = 700;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const x = (612 - drawWidth) / 2;
      const y = (740 - drawHeight) / 2;

      page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
    } catch (error) {
      const errorPage = pdfDoc.addPage([612, 792]);
      errorPage.drawText(`POD ${index + 1} could not be embedded`, { x: 50, y: 740, size: 14, font: titleFont, color: rgb(0.8, 0.2, 0.2) });
      errorPage.drawText(`File: ${pod.file_name || 'Unknown'}`, { x: 50, y: 710, size: 11, font: bodyFont });
      errorPage.drawText(`Reason: ${String(error).slice(0, 180)}`, { x: 50, y: 690, size: 10, font: bodyFont });
    }
  }

  const mergedBytes = await pdfDoc.save();
  return Buffer.from(mergedBytes);
}

async function sendInvoiceEmailForLoad({ loadId, additionalCc = [] }) {
  console.log(`[Email] Sending invoice for load ${loadId}`);

  const loadResult = await pool.query(
    'SELECT id, load_number, customer_id, bol_number, acceptance_token FROM loads WHERE id = $1',
    [loadId]
  );
  if (loadResult.rows.length === 0) {
    const error = new Error('Load not found');
    error.statusCode = 404;
    throw error;
  }
  const load = loadResult.rows[0];

  const customerResult = await pool.query(
    'SELECT company_name, email FROM customers WHERE id = $1',
    [load.customer_id]
  );
  if (customerResult.rows.length === 0 || !customerResult.rows[0].email) {
    const error = new Error('Customer email not configured');
    error.statusCode = 400;
    throw error;
  }
  const customer = customerResult.rows[0];

  const invoiceResult = await pool.query(
    'SELECT * FROM invoices WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1',
    [loadId]
  );
  if (invoiceResult.rows.length === 0) {
    const error = new Error('Invoice not found for this load');
    error.statusCode = 404;
    throw error;
  }
  const invoice = invoiceResult.rows[0];

  const outlookUser = process.env.OUTLOOK_USER;
  const outlookPassword = process.env.OUTLOOK_PASSWORD;
  if (!outlookUser || !outlookPassword) {
    const error = new Error('Email credentials are not configured on the server');
    error.statusCode = 503;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
      user: outlookUser,
      pass: outlookPassword,
    },
  });

  const ccList = uniqueEmails([...(Array.isArray(additionalCc) ? additionalCc : []), ...DEFAULT_ALWAYS_CC]);
  const allRecipients = uniqueEmails([customer.email, ...ccList]).join(', ');

  const podResult = await pool.query(
    'SELECT id, file_name, file_url, file_type FROM pod_documents WHERE load_id = $1 ORDER BY uploaded_at ASC',
    [loadId]
  );
  const podDocuments = podResult.rows;

  const company = await fetchCompanySettings();
  const combinedPdf = await buildCombinedAttachmentPdf({
    load,
    invoice,
    podDocuments,
    customer,
    company,
  });

  const attachmentFileName = `Invoice-${invoice.invoice_number}-Load-${load.load_number}.pdf`;
  const mailOptions = {
    from: outlookUser,
    to: customer.email,
    cc: ccList.length > 0 ? ccList.join(', ') : undefined,
    subject: `Invoice ${invoice.invoice_number} - Load ${load.load_number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Invoice ${invoice.invoice_number}</h2>
        <p>Dear ${customer.company_name},</p>
        <p>Attached is a single combined PDF containing your invoice and POD documents for this load.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Load Number:</strong> ${load.load_number}</p>
          ${load.bol_number ? `<p><strong>BOL Number:</strong> ${load.bol_number}</p>` : ''}
          <p><strong>Invoice Amount:</strong> $${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p><strong>Attachment:</strong> ${attachmentFileName}</p>
        </div>
        <p>Thank you for your business.</p>
      </div>
    `,
    attachments: [
      {
        filename: attachmentFileName,
        content: combinedPdf,
        contentType: 'application/pdf',
      },
    ],
  };

  console.log(`[Email] Sending invoice ${invoice.invoice_number} to: ${allRecipients}`);
  const info = await transporter.sendMail(mailOptions);

  await pool.query(
    'UPDATE invoices SET emailed_at = NOW(), emailed_to = $1 WHERE id = $2',
    [allRecipients, invoice.id]
  );

  return {
    success: true,
    message: `Invoice ${invoice.invoice_number} sent successfully to ${customer.email}`,
    emailed_to: allRecipients,
    load_id: loadId,
    invoice_number: invoice.invoice_number,
    messageId: info.messageId,
  };
}

// Protected send endpoint (admin/staff flows)
app.post('/api/send-invoice-email', authenticateToken, async (req, res) => {
  try {
    const { load_id, additional_cc } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id is required' });

    const result = await sendInvoiceEmailForLoad({
      loadId: load_id,
      additionalCc: additional_cc,
    });

    res.json(result);
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

    const result = await sendInvoiceEmailForLoad({
      loadId: load_id,
      additionalCc: additional_cc,
    });

    res.json(result);
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
