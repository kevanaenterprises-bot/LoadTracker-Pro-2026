const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sendInvoiceEmail = require('./sendInvoiceEmail');
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
      await sendInvoiceEmail({
        to: test_email,
        cc: ['kevin@go4fc.com'],
        subject: '🔔 Test Invoice Email from GO 4 Farms & Cattle',
        text: 'This is a test email to verify your invoice email configuration.\n\nIf you received this, everything is working correctly!\n\nThank you,\nGO 4 Farms & Cattle',
        attachments: []
      });

      return res.json({ 
        success: true, 
        message: `Test email sent successfully to ${test_email}!` 
      });
    }

    // Validate load_id for real invoice sends
    if (!load_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: load_id' 
      });
    }

    console.log('[Invoice Email] Processing for load_id:', load_id);

    // Fetch load details with related data
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select(`
        *,
        customer:customers(*),
        driver:drivers(*)
      `)
      .eq('id', load_id)
      .single();

    if (loadError || !load) {
      console.error('[Invoice Email] Load fetch error:', loadError);
      return res.status(404).json({ 
        error: 'Load not found',
        details: loadError?.message 
      });
    }

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
    if (!load.customer || !load.customer.email) {
      return res.status(400).json({ 
        error: 'Customer email not found',
        details: 'The load customer does not have an email address configured' 
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
    const customerEmail = load.customer.email;
    const ccEmails = [accountingEmail, 'gofarmsbills@gmail.com', 'esubmit@afs.net'].filter(Boolean);
    const invoiceNumber = invoice.invoice_number;
    const amount = invoice.amount;

    const subject = `Invoice ${invoiceNumber} — ${companyName} ($${amount})`;
    const text = `Please see attached invoice.\n\nThank you,\n${companyName}`;

    // Prepare PDF attachment
    let attachments = [];
    
    if (pdfBase64) {
      // If PDF is passed from frontend (base64)
      attachments.push({
        filename: `Invoice-${invoiceNumber}.pdf`,
        content: pdfBase64,
        encoding: 'base64'
      });
    } else if (invoiceData && invoiceData.pdfPath) {
      // If PDF path is provided
      attachments.push({
        filename: `Invoice-${invoiceNumber}.pdf`,
        path: invoiceData.pdfPath
      });
    } else {
      // TODO: Generate PDF here if needed
      // For now, just send without attachment or return error
      console.warn('[Invoice Email] No PDF provided - sending email without attachment');
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
    res.status(500).json({ 
      error: 'Failed to send invoice email', 
      details: error.message 
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
