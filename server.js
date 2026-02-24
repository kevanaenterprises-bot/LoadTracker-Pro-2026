const express = require('express');
const cors = require('cors');
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

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📧 Email service ready with Outlook SMTP`);
  console.log(`🔗 Supabase connected: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}`);
});
