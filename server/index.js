import express from 'express';
import cors from 'cors';
import pg from 'pg';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import hereApi from './hereApi.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
import { PDFDocument as LibPDF } from 'pdf-lib';

const { Pool } = pg;

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting only to API routes
app.use('/api', limiter);

// Middleware
app.use(cors());
app.use(express.json());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

// Auto-create tables that may not exist yet
pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('[DB] Failed to create password_reset_tokens:', err.message));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: 'v5-driver-supabase' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const result = await pool.query(
      'SELECT id, email, name, role, driver_id, is_active, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];
    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }
    res.json({
      success: true,
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
    res.status(500).json({ error: 'Server error' });
  }
});

// Request password reset — sends email with token link
app.post('/api/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const result = await pool.query('SELECT id FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase().trim()]);
    // Always return success so we don't leak whether an email is registered
    if (result.rows.length === 0) return res.json({ success: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3`,
      [result.rows[0].id, token, expires]
    );

    const outlookUser = process.env.OUTLOOK_USER;
    const outlookPassword = process.env.OUTLOOK_PASS;
    const appUrl = process.env.APP_URL || 'https://loadtrackerpro.turtlelogisticsllc.com';

    if (!outlookUser || !outlookPassword) {
      console.error('[Reset] Email creds not configured');
      return res.status(503).json({ error: 'Email service not configured on server' });
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: outlookUser, pass: outlookPassword },
    });

    await transporter.sendMail({
      from: outlookUser,
      to: email,
      subject: 'LoadTracker Pro — Password Reset',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:8px">
          <h2 style="color:#1e3a5f;margin-bottom:8px">Reset Your Password</h2>
          <p style="color:#475569">Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${appUrl}/app/reset-password?token=${token}"
             style="display:inline-block;margin:24px 0;padding:12px 28px;background:#1e3a5f;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Reset Password
          </a>
          <p style="color:#94a3b8;font-size:12px">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Complete password reset — validates token and sets new password
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const result = await pool.query(
      `SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const userId = result.rows[0].user_id;
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password, userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generic query endpoint
// WARNING: This endpoint should be replaced with specific authenticated endpoints in production
app.post('/api/query', async (req, res) => {
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
app.post('/api/geocode-and-save', async (req, res) => {
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

// Generate invoice PDF and combine with POD images into a single PDF buffer
async function buildInvoicePDF({ invoice, load, customer, geofenceTimestamps, podImageBuffers }) {
  return new Promise(async (resolve, reject) => {
    try {
      const BLUE = '#2D5BA0';
      const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', async () => {
        try {
          const invoicePdfBytes = Buffer.concat(chunks);

          // If no POD images, return invoice PDF as-is
          if (!podImageBuffers.length) return resolve(invoicePdfBytes);

          // Merge invoice PDF + POD images into one PDF using pdf-lib
          const merged = await LibPDF.create();
          const invoiceDoc = await LibPDF.load(invoicePdfBytes);
          for (const page of invoiceDoc.getPages()) {
            const [copiedPage] = await merged.copyPages(invoiceDoc, [invoiceDoc.getPages().indexOf(page)]);
            merged.addPage(copiedPage);
          }

          // Add each POD image as a new page
          for (const imgBuf of podImageBuffers) {
            try {
              let embeddedImg;
              try { embeddedImg = await merged.embedJpg(imgBuf); }
              catch { embeddedImg = await merged.embedPng(imgBuf); }
              const { width, height } = embeddedImg.scale(1);
              const pageWidth = 612, pageHeight = 792;
              const scale = Math.min(pageWidth / width, pageHeight / height, 1);
              const imgPage = merged.addPage([pageWidth, pageHeight]);
              imgPage.drawImage(embeddedImg, {
                x: (pageWidth - width * scale) / 2,
                y: (pageHeight - height * scale) / 2,
                width: width * scale,
                height: height * scale,
              });
            } catch (e) {
              console.warn('[PDF] Could not embed POD image:', e.message);
            }
          }

          const finalBytes = await merged.save();
          resolve(Buffer.from(finalBytes));
        } catch (e) { reject(e); }
      });
      doc.on('error', reject);

      // ── Header bar ──
      doc.rect(40, 40, 532, 44).fill(BLUE);
      doc.fontSize(18).fillColor('white').font('Helvetica-Bold')
        .text(invoice.company_name || 'GO 4 Farms & Cattle', 52, 52, { width: 280 });
      doc.fontSize(18).text('INVOICE', 40, 52, { width: 524, align: 'right' });

      // ── Invoice meta ──
      doc.fillColor('black').font('Helvetica-Bold').fontSize(12)
        .text(`Invoice #: ${invoice.invoice_number}`, 40, 104);
      doc.font('Helvetica').fontSize(11)
        .text(`Date: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, 350, 104);
      doc.font('Helvetica').fontSize(10).fillColor('#555')
        .text(`Load #: ${load.load_number || ''}`, 40, 120)
        .text(`BOL #: ${load.bol_number || ''}`, 220, 120);

      // ── Bill To ──
      doc.moveTo(40, 142).lineTo(572, 142).strokeColor('#ddd').stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888')
        .text('BILL TO', 40, 150);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
        .text(customer.company_name || '-', 40, 163);
      doc.font('Helvetica').fontSize(10).fillColor('#555')
        .text(customer.email || '', 40, 177);

      // ── Route ──
      doc.moveTo(40, 200).lineTo(572, 200).strokeColor('#ddd').stroke();
      doc.font('Helvetica').fontSize(11).fillColor('black')
        .text(`Route: ${load.origin_city || ''}, ${load.origin_state || ''}  ->  ${load.dest_city || ''}, ${load.dest_state || ''}`, 40, 210);

      // ── Line items table ──
      doc.rect(40, 230, 532, 20).fill('#eee');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
        .text('Description', 52, 235).text('Amount', 52, 235, { width: 512, align: 'right' });

      let y = 258;
      const addRow = (label, amount) => {
        if (!amount) return;
        doc.font('Helvetica').fontSize(10).fillColor('black')
          .text(label, 52, y)
          .text(`$${parseFloat(amount).toFixed(2)}`, 52, y, { width: 512, align: 'right' });
        y += 20;
      };
      addRow('Freight Charge', load.rate);
      addRow('Extra Stop Fee', load.extra_stop_fee);
      addRow('Lumper Fee', load.lumper_fee);

      // ── Total bar ──
      const total = (parseFloat(load.rate) || 0) + (parseFloat(load.extra_stop_fee) || 0) + (parseFloat(load.lumper_fee) || 0);
      doc.rect(40, y + 4, 532, 24).fill(BLUE);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('white')
        .text('TOTAL DUE', 52, y + 10)
        .text(`$${total.toFixed(2)}`, 52, y + 10, { width: 512, align: 'right' });
      y += 44;

      // ── GPS Timestamps ──
      if (geofenceTimestamps?.length) {
        y += 12;
        doc.moveTo(40, y).lineTo(572, y).strokeColor('#ddd').stroke();
        y += 10;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('GPS VERIFIED TIMESTAMPS', 40, y);
        y += 14;
        for (const ts of geofenceTimestamps) {
          const inTime = ts.geofence_entered_at ? new Date(ts.geofence_entered_at).toLocaleString() : '';
          const outTime = ts.geofence_exited_at ? new Date(ts.geofence_exited_at).toLocaleString() : '';
          const label = ts.stop_type === 'delivery' ? 'Delivery' : 'Pickup';
          doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(`${label}:`, 40, y, { width: 60 });
          doc.font('Helvetica').fontSize(10).text(`In: ${inTime}`, 105, y).text(`Out: ${outTime}`, 340, y);
          y += 16;
        }
      }

      // ── Footer ──
      y += 16;
      doc.font('Helvetica').fontSize(9).fillColor('#888')
        .text('Payment due within 30 days. Thank you for your business!', 40, y);

      doc.end();
    } catch (e) { reject(e); }
  });
}

// Helper: send email via Resend
async function sendViaResend({ to, cc, subject, html, attachments = [] }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'kevin@go4fc.com';
  const AUTO_CC = process.env.AUTO_CC ? process.env.AUTO_CC.split(',').map(e => e.trim()).filter(Boolean) : [];

  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured in Railway environment variables');

  const toList = Array.isArray(to) ? to : [to];
  const ccList = [...(Array.isArray(cc) ? cc : cc ? [cc] : []), ...AUTO_CC].filter(Boolean);

  const body = { from: FROM_EMAIL, to: toList, subject, html };
  if (ccList.length) body.cc = ccList;
  if (attachments.length) {
    body.attachments = attachments.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString('base64'),
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Resend API error');
  return data;
}

// Send invoice email endpoint
// Driver app calls this to update load status in Railway PostgreSQL
app.post('/api/update-load-status', async (req, res) => {
  try {
    const { load_id, status } = req.body;
    if (!load_id || !status) return res.status(400).json({ error: 'load_id and status required' });
    const allowed = ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await pool.query('UPDATE loads SET status = $1 WHERE id = $2', [status, load_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-invoice-email', async (req, res) => {
  try {
    const { load_id, additional_cc, test_email } = req.body;

    if (!load_id) {
      return res.status(400).json({ error: 'load_id is required' });
    }

    // Handle test email from Settings page
    if (load_id === '__test__') {
      const recipient = test_email || process.env.FROM_EMAIL || 'kevin@go4fc.com';
      await sendViaResend({
        to: recipient,
        subject: 'LoadTracker Pro — Test Email',
        html: `<h2>Test Email</h2><p>Your email configuration is working correctly.</p><p>Sent at: ${new Date().toISOString()}</p>`,
      });
      return res.json({ success: true, message: `Test email sent to ${recipient}` });
    }

    console.log(`[Email] Sending invoice for load ${load_id}`);
    
    const DRIVER_SUPABASE_URL_BASE = process.env.DRIVER_SUPABASE_URL || 'https://qekevyqhwxqyypmhjobd.supabase.co';
    const DRIVER_SUPABASE_ANON = process.env.DRIVER_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFla2V2eXFod3hxeXlwbWhqb2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTUwNDEsImV4cCI6MjA4NjU5MTA0MX0.YXbIJG5F1nSB9obbuLkhINPcPyznCc4VpZhWuP70_BE';
    const driverHeaders = { 'apikey': DRIVER_SUPABASE_ANON, 'Authorization': `Bearer ${DRIVER_SUPABASE_ANON}` };

    // Get load + customer from Railway PostgreSQL (source of truth)
    const loadDbRes = await pool.query(
      `SELECT l.id, l.load_number, l.customer_id, c.company_name, c.email
       FROM loads l LEFT JOIN customers c ON c.id = l.customer_id
       WHERE l.id = $1 LIMIT 1`,
      [load_id]
    );
    if (!loadDbRes.rows.length) {
      return res.status(404).json({ error: 'Load not found' });
    }
    const loadRow = loadDbRes.rows[0];
    const customer = { company_name: loadRow.company_name, email: loadRow.email };

    // Get invoice from driver Supabase (created by driver app)
    const invRes = await fetch(
      `${DRIVER_SUPABASE_URL_BASE}/rest/v1/invoices?load_id=eq.${load_id}&select=invoice_number,amount&order=created_at.desc&limit=1`,
      { headers: driverHeaders }
    );
    const invRows = invRes.ok ? await invRes.json() : [];
    const invRow = invRows[0] || {};

    const invoice = {
      invoice_number: invRow.invoice_number || 'N/A',
      amount: invRow.amount || 0,
      load_number: loadRow.load_number,
      company_name: customer.company_name,
    };
    const customerEmail = customer.email;

    if (!customerEmail) {
      return res.status(400).json({ error: 'Customer email not configured' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('[Email] RESEND_API_KEY not configured');
      return res.status(503).json({
        error: 'Email service not configured',
        message: 'RESEND_API_KEY is not set in Railway environment variables'
      });
    }

    // Get full load details for PDF
    const fullLoadRes = await pool.query(
      `SELECT l.*, c.company_name, c.email FROM loads l LEFT JOIN customers c ON c.id = l.customer_id WHERE l.id = $1`,
      [load_id]
    );
    const fullLoad = fullLoadRes.rows[0] || {};

    // Get geofence timestamps
    const geoRes = await pool.query(
      `SELECT stop_type, geofence_entered_at, geofence_exited_at FROM load_stops WHERE load_id = $1 ORDER BY stop_sequence`,
      [load_id]
    ).catch(() => ({ rows: [] }));

    // Fetch POD images from driver Supabase
    let podImageBuffers = [];
    try {
      const podRes = await fetch(
        `${DRIVER_SUPABASE_URL_BASE}/rest/v1/pod_documents?load_id=eq.${load_id}&select=file_url`,
        { headers: driverHeaders }
      );
      if (podRes.ok) {
        const pods = await podRes.json();
        for (const pod of pods) {
          try {
            const imgRes = await fetch(pod.file_url);
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              if (buf.length > 0) podImageBuffers.push(buf);
              else console.warn('[PDF] POD image empty, skipping:', pod.file_url);
            }
          } catch (e) { console.warn('[PDF] Failed to fetch POD:', e.message); }
        }
      }
    } catch (e) { console.warn('[PDF] Failed to fetch POD list:', e.message); }

    // Get company name from settings
    const settingsRes = await pool.query(`SELECT key, value FROM settings WHERE key = 'company_name'`).catch(() => ({ rows: [] }));
    const companyName = settingsRes.rows.find(r => r.key === 'company_name')?.value || 'GO 4 Farms & Cattle';
    invoice.company_name = companyName;

    // Build combined invoice + POD PDF
    const pdfBuffer = await buildInvoicePDF({
      invoice,
      load: fullLoad,
      customer,
      geofenceTimestamps: geoRes.rows,
      podImageBuffers,
    });

    const emailedTo = [customerEmail, ...(additional_cc || [])].join(', ');

    await sendViaResend({
      to: customerEmail,
      cc: additional_cc && additional_cc.length ? additional_cc : undefined,
      subject: `Invoice ${invoice.invoice_number} — Load #${invoice.load_number}`,
      html: `
        <p>Dear ${customer.company_name || 'Valued Customer'},</p>
        <p>Please find attached your invoice for Load <strong>#${fullLoad.load_number}</strong>.</p>
        <p>The attachment includes the invoice and all proof of delivery documents.</p>
        <p>Payment due within 30 days. Thank you for your business.</p>
      `,
      attachments: [{ filename: `Invoice_${invoice.invoice_number}.pdf`, content: pdfBuffer }],
    });

    console.log(`[Email] Sent invoice ${invoice.invoice_number} to: ${emailedTo} with ${podImageBuffers.length} POD(s)`);

    res.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} sent to ${customerEmail}`,
      emailed_to: emailedTo,
      load_id,
      invoice_number: invoice.invoice_number,
      pod_count: podImageBuffers.length,
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
