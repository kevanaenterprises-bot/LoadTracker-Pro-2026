const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sendInvoiceEmail = require('./sendInvoiceEmail');
const { combinePDFs } = require('./combinePDFs');
require('dotenv').config();

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
    // Strategy: attach invoice PDF directly (avoids pdf-lib re-encoding jsPDF output),
    // then combine any POD images/PDFs into a second PDF if present.
    let attachments = [];

    if (pdfBase64) {
      const invoiceBuf = Buffer.from(pdfBase64, 'base64');

      if (podFiles.length > 0) {
        // Combine invoice + POD files into one PDF via pdf-lib
        const allFiles = [
          { type: 'pdf', data: invoiceBuf, filename: `Invoice-${invoiceNumber}.pdf` },
          ...podFiles
        ];
        try {
          const combinedBuf = await combinePDFs(allFiles);
          // If combined PDF is unreasonably small, pdf-lib couldn't parse the invoice page —
          // fall back to two separate attachments so nothing is lost.
          if (combinedBuf.length > 2000) {
            attachments.push({
              filename: `Invoice-${invoiceNumber}-Complete.pdf`,
              content: combinedBuf
            });
            console.log('[Invoice Email] Combined invoice + POD PDF created successfully');
          } else {
            console.warn('[Invoice Email] Combined PDF suspiciously small, sending separately');
            attachments.push({ filename: `Invoice-${invoiceNumber}.pdf`, content: invoiceBuf });
            const podBuf = await combinePDFs(podFiles);
            if (podBuf.length > 500) attachments.push({ filename: `POD-Documents.pdf`, content: podBuf });
          }
        } catch (combineError) {
          console.error('[Invoice Email] PDF combination failed, sending separately:', combineError);
          attachments.push({ filename: `Invoice-${invoiceNumber}.pdf`, content: invoiceBuf });
          try {
            const podBuf = await combinePDFs(podFiles);
            if (podBuf.length > 500) attachments.push({ filename: `POD-Documents.pdf`, content: podBuf });
          } catch {}
        }
      } else {
        // No PODs — just attach the invoice PDF directly
        attachments.push({ filename: `Invoice-${invoiceNumber}.pdf`, content: invoiceBuf });
        console.log('[Invoice Email] Attaching invoice PDF only (no POD documents found)');
      }
    } else if (podFiles.length > 0) {
      // No invoice PDF passed — combine whatever POD files we have
      try {
        const combinedBuf = await combinePDFs(podFiles);
        attachments.push({ filename: `Invoice-${invoiceNumber}-Complete.pdf`, content: combinedBuf });
      } catch (err) {
        console.error('[Invoice Email] Failed to combine POD files:', err);
      }
    } else {
      console.warn('[Invoice Email] No invoice PDF and no POD documents — sending email without attachment');
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

    // Update invoice status to SENT
    await supabase
      .from('invoices')
      .update({ 
        status: 'SENT',
        sent_at: new Date().toISOString()
      })
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
