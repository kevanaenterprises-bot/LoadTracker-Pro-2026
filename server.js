const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sendInvoiceEmail = require('./sendInvoiceEmail');
const { combinePDFs } = require('./combinePDFs');
require('dotenv').config();

/**
 * Sanitize a value for use with pdf-lib StandardFonts (WinAnsiEncoding / Latin-1).
 * Replaces common Unicode punctuation with ASCII equivalents, removes anything
 * outside the printable Latin-1 range that would throw inside page.drawText().
 */
function sanitizeText(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2022\u2023\u2043]/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ''); // strip anything outside printable Latin-1
}

/**
 * Generate a clean, text-based invoice PDF server-side using pdf-lib.
 * Used when the frontend doesn't supply pdfBase64 (e.g. auto-send on POD upload).
 */
async function generateServerInvoicePdf(load, invoice, customer, companyName) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0, 0, 0);
  const grey = rgb(0.45, 0.45, 0.45);
  const blue = rgb(0.05, 0.35, 0.7);
  const lightGrey = rgb(0.92, 0.92, 0.92);

  let y = height - 48;
  const left = 48;
  const right = width - 48;

  // ── Header bar ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 36, color: blue });
  page.drawText(sanitizeText(companyName || 'GO 4 Farms & Cattle'), {
    x: left + 10, y: y + 6, size: 16, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText(`INVOICE`, {
    x: right - 80, y: y + 6, size: 16, font: bold, color: rgb(1, 1, 1),
  });
  y -= 52;

  // ── Invoice meta ────────────────────────────────────────────────────────
  const invoiceDate = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  page.drawText(sanitizeText(`Invoice #: ${invoice.invoice_number}`), { x: left, y, size: 11, font: bold, color: black });
  page.drawText(sanitizeText(`Date: ${invoiceDate}`), { x: right - 140, y, size: 10, font: regular, color: black });
  y -= 18;
  page.drawText(sanitizeText(`Load #: ${load.load_number || '-'}`), { x: left, y, size: 10, font: regular, color: grey });
  y -= 28;

  // ── Divider ──────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGrey });
  y -= 20;

  // ── Bill To ──────────────────────────────────────────────────────────────
  page.drawText('BILL TO', { x: left, y, size: 9, font: bold, color: grey });
  y -= 14;
  page.drawText(sanitizeText(customer.name || '-'), { x: left, y, size: 11, font: bold, color: black });
  y -= 14;
  if (customer.address) {
    page.drawText(sanitizeText(customer.address), { x: left, y, size: 10, font: regular, color: black });
    y -= 14;
  }
  const cityLine = [customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  if (cityLine) {
    page.drawText(sanitizeText(cityLine), { x: left, y, size: 10, font: regular, color: black });
    y -= 14;
  }
  if (customer.pod_email || customer.email) {
    page.drawText(sanitizeText(customer.pod_email || customer.email), { x: left, y, size: 9, font: regular, color: grey });
    y -= 14;
  }
  y -= 16;

  // ── Route ────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGrey });
  y -= 16;
  const origin = sanitizeText([load.origin_city, load.origin_state].filter(Boolean).join(', ') || '-');
  const dest = sanitizeText([load.dest_city, load.dest_state].filter(Boolean).join(', ') || '-');
  page.drawText(`Route: ${origin}  ->  ${dest}`, { x: left, y, size: 10, font: regular, color: black });
  y -= 22;

  // ── Charges table header ─────────────────────────────────────────────────
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 20, color: lightGrey });
  page.drawText('Description', { x: left + 8, y: y + 2, size: 9, font: bold, color: black });
  page.drawText('Amount', { x: right - 70, y: y + 2, size: 9, font: bold, color: black });
  y -= 24;

  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  const rows = [
    ['Freight Charge', load.rate],
  ];
  if (load.fuel_surcharge) rows.push(['Fuel Surcharge', load.fuel_surcharge]);
  if (load.extra_stop_fee) rows.push(['Extra Stop Fee', load.extra_stop_fee]);
  if (load.lumper_fee) rows.push(['Lumper Fee', load.lumper_fee]);
  if (load.detention_pay) rows.push(['Detention Pay', load.detention_pay]);

  for (const [desc, amt] of rows) {
    page.drawText(sanitizeText(desc), { x: left + 8, y, size: 10, font: regular, color: black });
    page.drawText(sanitizeText(fmt(amt)), { x: right - 70, y, size: 10, font: regular, color: black });
    y -= 18;
  }

  // ── Total bar ────────────────────────────────────────────────────────────
  y -= 8;
  page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 26, color: blue });
  page.drawText('TOTAL DUE', { x: left + 10, y: y + 4, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText(fmt(invoice.amount), { x: right - 80, y: y + 4, size: 13, font: bold, color: rgb(1, 1, 1) });
  y -= 44;

  // ── Payment terms ─────────────────────────────────────────────────────────
  page.drawText('Payment due within 30 days. Thank you for your business!', {
    x: left, y, size: 9, font: regular, color: grey,
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for backend
);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for base64 PDFs

// Serve static React files
const reactBuildPath = path.join(__dirname, 'public');
app.use(express.static(reactBuildPath));

// Root endpoint - welcome message
app.get('/', (req, res) => {
  res.json({
    name: 'LoadTracker Pro Email API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      sendInvoiceEmail: 'POST /api/send-invoice-email'
    },
    message: 'Direct Outlook SMTP Email Service - No attachment limits! 📧'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API health check endpoint (used by frontend)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Query users table
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, driver_id, name, is_active')
      .eq('email', email.toLowerCase().trim())
      .eq('password_hash', password)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.error('[Login] Query error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        driver_id: user.driver_id,
        name: user.name,
        is_active: user.is_active
      }
    });

  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// General database query endpoint (for backwards compatibility)
app.post('/api/query', async (req, res) => {
  try {
    const { text, params } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    console.log('[Query] Executing:', text, 'Params:', params);

    // Parse the SQL query to extract table and columns
    const queryUpper = text.toUpperCase().trim();
    
    // Handle SELECT queries
    if (queryUpper.startsWith('SELECT')) {
      // Extract table name using regex
      const fromMatch = text.match(/FROM\s+(\w+)/i);
      if (!fromMatch) {
        return res.status(400).json({ error: 'Could not parse table name from query' });
      }
      
      const tableName = fromMatch[1];
      
      // Extract columns
      const selectMatch = text.match(/SELECT\s+(.*?)\s+FROM/is);
      const columns = selectMatch ? selectMatch[1].trim() : '*';
      
      // Start building the query
      let query = supabase.from(tableName);
      
      // Apply select (handle * or specific columns)
      if (columns === '*') {
        query = query.select('*');
      } else {
        query = query.select(columns);
      }
      
      // Parse WHERE clause
      const whereMatch = text.match(/WHERE\s+(.*?)(?:ORDER|LIMIT|$)/is);
      if (whereMatch && params) {
        const whereClause = whereMatch[1].trim();
        // Simple WHERE parsing - handle basic comparisons
        const conditions = whereClause.split(/\s+AND\s+/i);
        
        conditions.forEach((condition, index) => {
          // Match: column = $1 OR column LIKE $1, etc.
          const condMatch = condition.match(/(\w+)\s*(=|LIKE|>|<|>=|<=)\s*\$(\d+)/i);
          if (condMatch && params[parseInt(condMatch[3]) - 1] !== undefined) {
            const colName = condMatch[1];
            const operator = condMatch[2].toUpperCase();
            const value = params[parseInt(condMatch[3]) - 1];
            
            switch (operator) {
              case '=':
                query = query.eq(colName, value);
                break;
              case 'LIKE':
                query = query.like(colName, value);
                break;
              case '>':
                query = query.gt(colName, value);
                break;
              case '<':
                query = query.lt(colName, value);
                break;
              case '>=':
                query = query.gte(colName, value);
                break;
              case '<=':
                query = query.lte(colName, value);
                break;
            }
          }
        });
      }
      
      // Parse ORDER BY
      const orderMatch = text.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
      if (orderMatch) {
        const orderCol = orderMatch[1];
        const orderDir = orderMatch[2] ? orderMatch[2].toLowerCase() === 'desc' : false;
        query = query.order(orderCol, { ascending: !orderDir });
      }
      
      // Parse LIMIT
      const limitMatch = text.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        query = query.limit(parseInt(limitMatch[1]));
      }
      
      // Execute query
      const { data, error } = await query;
      
      if (error) {
        console.error('[Query] Supabase error:', error);
        return res.status(500).json({ error: error.message });
      }
      
      res.json({
        rows: data || [],
        rowCount: data ? data.length : 0
      });
      
    } else if (queryUpper.startsWith('INSERT')) {
      // Handle INSERT
      const intoMatch = text.match(/INSERT INTO\s+(\w+)/i);
      if (!intoMatch) {
        return res.status(400).json({ error: 'Could not parse INSERT query' });
      }
      
      const tableName = intoMatch[1];
      
      // For now, return success (INSERT queries need more complex parsing)
      res.json({ rows: [], rowCount: 1 });
      
    } else if (queryUpper.startsWith('UPDATE')) {
      // Handle UPDATE
      const tableMatch = text.match(/UPDATE\s+(\w+)/i);
      if (!tableMatch) {
        return res.status(400).json({ error: 'Could not parse UPDATE query' });
      }
      
      const tableName = tableMatch[1];
      
      // For now, return success
      res.json({ rows: [], rowCount: 1 });
      
    } else {
      // Unsupported query type
      res.json({ rows: [], rowCount: 0 });
    }

  } catch (error) {
    console.error('[Query] Exception:', error);
    res.status(500).json({ error: error.message });
  }
});

// Main invoice email endpoint (compatible with old Edge Function interface)
app.post('/api/send-invoice-email', async (req, res) => {
  try {
    const { load_id, test_email, pdfBase64, invoiceData } = req.body;

    // Handle test email scenario
    if (load_id === '__test__' && test_email) {
      console.log('[Test Email] Attempting SMTP send to:', test_email);
      console.log('[Test Email] OUTLOOK_USER set:', !!process.env.OUTLOOK_USER);
      console.log('[Test Email] OUTLOOK_PASS set:', !!process.env.OUTLOOK_PASS);
      try {
        await sendInvoiceEmail({
          to: test_email,
          cc: ['kevin@go4fc.com'],
          subject: '🔔 Test Invoice Email from GO 4 Farms & Cattle',
          text: 'This is a test email to verify your invoice email configuration.\n\nIf you received this, everything is working correctly!\n\nThank you,\nGO 4 Farms & Cattle',
          attachments: []
        });
        console.log('[Test Email] SMTP send succeeded');
        return res.json({ success: true, message: `Test email sent successfully to ${test_email}!` });
      } catch (smtpErr) {
        console.error('[Test Email] SMTP error:', smtpErr.message);
        return res.status(500).json({ error: `SMTP failed: ${smtpErr.message}` });
      }
    }

    // Validate load_id for real invoice sends
    if (!load_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: load_id' 
      });
    }

    console.log('[Invoice Email] Processing for load_id:', load_id);

    // Fetch load details FIRST (without joins)
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('*')
      .eq('id', load_id)
      .single();

    if (loadError || !load) {
      console.error('[Invoice Email] Load fetch error:', loadError);
      return res.status(404).json({ 
        error: 'Load not found',
        details: loadError?.message 
      });
    }

    console.log('[Invoice Email] Load data:', { 
      id: load.id, 
      customer_id: load.customer_id,
      customer_number: load.customer_number,
      all_columns: Object.keys(load)
    });

    // Fetch customer separately using whichever ID field exists
    const customerId = load.customer_id || load.customer_number;
    if (!customerId) {
      return res.status(400).json({ 
        error: 'No customer associated with this load',
        details: 'Load is missing customer_id or customer_number' 
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      console.error('[Invoice Email] Customer fetch error:', customerError);
      return res.status(404).json({ 
        error: 'Customer not found',
        details: customerError?.message 
      });
    }

    // Attach customer to load object for compatibility
    load.customer = customer;

    // Determine primary email: prefer pod_email, fall back to general email
    const primaryEmail = (customer.pod_email || customer.email || '').trim();
    console.log('[Invoice Email] Customer email:', primaryEmail, '(from', customer.pod_email ? 'pod_email' : 'email', ')');

    // Fetch invoice for this load
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('load_id', load_id)
      .single();

    if (invoiceError || !invoice) {
      console.error('[Invoice Email] Invoice fetch error:', invoiceError);
      return res.status(404).json({ 
        error: 'Invoice not found for this load',
        details: invoiceError?.message 
      });
    }

    // Validate customer email
    if (!primaryEmail) {
      return res.status(400).json({ 
        error: 'Customer email not found',
        details: 'The load customer does not have a POD email or general email address configured' 
      });
    }

    // Get accounting settings
    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['invoice_notification_email', 'company_name']);

    const accountingEmail = settings?.find(s => s.key === 'invoice_notification_email')?.value || 'kevin@go4fc.com';
    const companyName = settings?.find(s => s.key === 'company_name')?.value || 'GO 4 Farms & Cattle';

    // Prepare email details
    const customerEmail = primaryEmail;
    const ccEmails = [accountingEmail, 'gofarmsbills@gmail.com'].filter(Boolean);
    const invoiceNumber = invoice.invoice_number;
    const amount = invoice.amount;

    const subject = `Invoice ${invoiceNumber} — ${companyName} ($${amount})`;
    const text = `Please see attached invoice.\n\nThank you,\n${companyName}`;

    // Fetch POD/supporting documents for this load
    const { data: podDocuments } = await supabase
      .from('pod_documents')
      .select('*')
      .eq('load_id', load_id)
      .order('created_at', { ascending: true });

    console.log('[Invoice Email] Found', podDocuments?.length || 0, 'POD documents');

    // Fetch POD files via their public URLs (file_url column)
    const imageExtensions = ['.jpg', '.jpeg', '.png'];
    const podFiles = [];
    if (podDocuments && podDocuments.length > 0) {
      for (const doc of podDocuments) {
        try {
          if (doc.file_url) {
            const response = await fetch(doc.file_url);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const ext = path.extname(doc.file_name || '').toLowerCase();
              podFiles.push({
                type: imageExtensions.includes(ext) ? 'image' : 'pdf',
                data: buffer,
                filename: doc.file_name || `pod-${doc.id}${ext}`
              });
              console.log(`[Invoice Email] Fetched POD: ${doc.file_name}`);
            } else {
              console.warn(`[Invoice Email] Failed to fetch POD ${doc.file_name}: HTTP ${response.status}`);
            }
          }
        } catch (err) {
          console.error(`[Invoice Email] Error fetching POD ${doc.file_name}:`, err);
        }
      }
    }

    // Build attachment(s)
    let attachments = [];

    if (pdfBase64) {
      // The frontend already combined invoice + PODs into one PDF (generateCombinedInvoicePdfBase64).
      // Attach it directly — DO NOT run it through pdf-lib again; html2canvas output is not
      // compatible with PDFDocument.load() and the invoice pages will be silently dropped.
      console.log('[Invoice Email] Attaching frontend-generated combined PDF directly');
      attachments.push({
        filename: `Invoice-${invoiceNumber}.pdf`,
        content: Buffer.from(pdfBase64, 'base64'),
      });
    } else {
      // Auto-send path (e.g. driver POD upload) — no frontend PDF supplied.
      // Generate a clean invoice PDF server-side, then combine with any POD images.
      console.log('[Invoice Email] No pdfBase64 — generating server-side invoice PDF');
      try {
        const invoiceBuf = await generateServerInvoicePdf(load, invoice, customer, companyName);

        if (podFiles.length > 0) {
          const allFiles = [
            { type: 'pdf', data: invoiceBuf, filename: `Invoice-${invoiceNumber}.pdf` },
            ...podFiles,
          ];
          const combinedBuf = await combinePDFs(allFiles);
          attachments.push({
            filename: `Invoice-${invoiceNumber}.pdf`,
            content: combinedBuf.length > 2000 ? combinedBuf : invoiceBuf,
          });
          console.log('[Invoice Email] Server-side invoice + POD combined PDF created');
        } else {
          attachments.push({ filename: `Invoice-${invoiceNumber}.pdf`, content: invoiceBuf });
          console.log('[Invoice Email] Server-side invoice PDF only (no POD documents found)');
        }
      } catch (genErr) {
        console.error('[Invoice Email] Server-side PDF generation failed:', genErr);
        // Last-resort fallback: attach just the POD images if we have them
        if (podFiles.length > 0) {
          try {
            const podBuf = await combinePDFs(podFiles);
            attachments.push({ filename: `POD-Documents.pdf`, content: podBuf });
          } catch {}
        }
      }
    }

    // Send the email
    console.log('[Invoice Email] Sending to:', customerEmail);
    console.log('[Invoice Email] CC:', ccEmails);

    await sendInvoiceEmail({
      to: customerEmail,
      cc: ccEmails,
      subject,
      text,
      attachments
    });

    // Update invoice status to SENT — emailed_at drives the "Waiting On Payment" bucket
    const now = new Date().toISOString();
    await supabase
      .from('invoices')
      .update({ status: 'SENT', sent_at: now, emailed_at: now })
      .eq('id', invoice.id);

    console.log('[Invoice Email] Success!');

    res.json({ 
      success: true, 
      message: `Invoice #${invoiceNumber} emailed successfully`,
      emailed_to: customerEmail,
      invoice_number: invoiceNumber
    });

  } catch (error) {
    console.error('[Invoice Email] Error:', error);
    console.error('[Invoice Email] Error stack:', error.stack);
    console.error('[Invoice Email] Error type:', error.constructor.name);
    res.status(500).json({ 
      error: 'Failed to send invoice email', 
      details: error.message,
      stack: error.stack 
    });
  }
});

// SPA fallback - serve React index.html for all non-API routes
// This must come AFTER all API routes (/api/*)
app.get('*', (req, res) => {
  const indexPath = path.join(reactBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error sending index.html:', err);
      res.status(500).send('Server error');
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📧 Email service ready with Outlook SMTP`);
  console.log(`🔗 Supabase connected: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}`);
  console.log(`📦 Serving React from: ${reactBuildPath}`);
});
