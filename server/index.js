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

// Send invoice email endpoint
app.post('/api/send-invoice-email', authenticateToken, async (req, res) => {
  try {
    const { load_id, additional_cc } = req.body;
    
    if (!load_id) {
      return res.status(400).json({ error: 'load_id is required' });
    }

    console.log(`[Email] Sending invoice for load ${load_id}`);
    
    // Get load with customer data using pg pool
    const loadResult = await pool.query(
      'SELECT id, load_number, customer_id, bol_number FROM loads WHERE id = $1',
      [load_id]
    );

    if (loadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Load not found' });
    }
    const load = loadResult.rows[0];

    // Get customer info
    const customerResult = await pool.query(
      'SELECT company_name, email FROM customers WHERE id = $1',
      [load.customer_id]
    );

    if (customerResult.rows.length === 0 || !customerResult.rows[0].email) {
      return res.status(400).json({ error: 'Customer email not configured' });
    }
    const customer = customerResult.rows[0];

    // Get invoice for this load
    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE load_id = $1',
      [load_id]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found for this load' });
    }
    const invoice = invoiceResult.rows[0];

    const customerEmail = customer.email;

    // Get email configuration from environment
    const outlookUser = process.env.OUTLOOK_USER;
    const outlookPassword = process.env.OUTLOOK_PASSWORD;

    if (!outlookUser || !outlookPassword) {
      console.warn('[Email] OUTLOOK_USER or OUTLOOK_PASSWORD not configured');
      return res.status(503).json({ 
        error: 'Email service not configured',
        message: 'Email credentials are not configured on the server' 
      });
    }

    // Create nodemailer transport for Outlook
    const transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false, // use TLS
      auth: {
        user: outlookUser,
        pass: outlookPassword,
      },
    });

    // Build CC list
    const ccList = additional_cc && Array.isArray(additional_cc) ? additional_cc : [];
    const allRecipients = [customerEmail, ...ccList].join(', ');

    // Get POD documents for this load
    const podResult = await pool.query(
      'SELECT * FROM pod_documents WHERE load_id = $1',
      [load_id]
    );
    const podDocuments = podResult.rows;

    // Email content (no attachments since storage is not managed here)
    const mailOptions = {
      from: outlookUser,
      to: customerEmail,
      cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      subject: `Invoice ${invoice.invoice_number} - Load ${load.load_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Invoice ${invoice.invoice_number}</h2>
          <p>Dear ${customer.company_name},</p>
          <p>Please find the invoice details below for the completed load.</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Load Details</h3>
            <p><strong>Load Number:</strong> ${load.load_number}</p>
            ${load.bol_number ? `<p><strong>BOL Number:</strong> ${load.bol_number}</p>` : ''}
            <p><strong>Invoice Amount:</strong> $${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            ${podDocuments.length > 0 ? `<p><strong>POD Documents:</strong> ${podDocuments.length} document(s) on file</p>` : ''}
          </div>
          
          <p>Thank you for your business!</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated email. Please do not reply directly to this message.
          </p>
        </div>
      `,
    };

    // Send email
    console.log(`[Email] Sending invoice ${invoice.invoice_number} to: ${allRecipients}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Email sent successfully: ${info.messageId}`);

    // Update invoice record with email info
    await pool.query(
      'UPDATE invoices SET emailed_at = NOW(), emailed_to = $1 WHERE id = $2',
      [allRecipients, invoice.id]
    );
    
    res.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} sent successfully to ${customerEmail}`,
      emailed_to: allRecipients,
      load_id: load_id,
      invoice_number: invoice.invoice_number,
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: error.message || 'Failed to send invoice email' });
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
