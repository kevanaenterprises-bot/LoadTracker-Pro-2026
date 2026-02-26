import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import hereApi from './hereApi.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration!');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY (or VITE_ prefixed versions)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase client initialized:', supabaseUrl);

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
    const { data, error } = await supabase.from('users').select('count').limit(1);
    res.json({ status: 'ok', timestamp: new Date().toISOString(), supabase: !error });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
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

// Send invoice email endpoint
app.post('/api/send-invoice-email', async (req, res) => {
  try {
    const { load_id, additional_cc } = req.body;
    
    if (!load_id) {
      return res.status(400).json({ error: 'load_id is required' });
    }

    console.log(`[Email] Sending invoice for load ${load_id}`);
    
    // Get load with customer data using Supabase
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('id, load_number, customer_id, bol_number')
      .eq('id', load_id)
      .single();

    if (loadError || !load) {
      console.error('[Email] Load not found:', loadError);
      return res.status(404).json({ error: 'Load not found' });
    }

    // Get customer info
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('company_name, email')
      .eq('id', load.customer_id)
      .single();

    if (customerError || !customer || !customer.email) {
      console.error('[Email] Customer not found or no email:', customerError);
      return res.status(400).json({ error: 'Customer email not configured' });
    }

    // Get invoice for this load
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('load_id', load_id)
      .single();

    if (invoiceError || !invoice) {
      console.error('[Email] Invoice not found:', invoiceError);
      return res.status(404).json({ error: 'Invoice not found for this load' });
    }

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
    const { data: podDocuments, error: podError } = await supabase
      .from('pod_documents')
      .select('*')
      .eq('load_id', load_id);

    if (podError) {
      console.warn('[Email] Error fetching POD documents:', podError);
    }

    // Download POD files and prepare attachments
    const attachments = [];
    if (podDocuments && podDocuments.length > 0) {
      console.log(`[Email] Found ${podDocuments.length} POD document(s) to attach`);
      
      for (const doc of podDocuments) {
        try {
          // Extract the file path from the URL
          // Format: https://...supabase.co/storage/v1/object/public/pod-documents/path/to/file.jpg
          const urlParts = doc.file_url.split('/pod-documents/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            
            // Download file from Supabase storage
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('pod-documents')
              .download(filePath);
            
            if (downloadError) {
              console.error(`[Email] Error downloading ${doc.file_name}:`, downloadError);
              continue;
            }

            // Convert blob to buffer
            const buffer = Buffer.from(await fileData.arrayBuffer());
            
            attachments.push({
              filename: doc.file_name,
              content: buffer,
              contentType: doc.file_type || 'application/octet-stream',
            });
            
            console.log(`[Email] Attached: ${doc.file_name} (${(buffer.length / 1024).toFixed(2)} KB)`);
          }
        } catch (err) {
          console.error(`[Email] Error processing attachment ${doc.file_name}:`, err);
        }
      }
    }

    // Email content
    const mailOptions = {
      from: outlookUser,
      to: customerEmail,
      cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      subject: `Invoice ${invoice.invoice_number} - Load ${load.load_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Invoice ${invoice.invoice_number}</h2>
          <p>Dear ${customer.company_name},</p>
          <p>Please find attached the invoice and proof of delivery documents for the completed load.</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Load Details</h3>
            <p><strong>Load Number:</strong> ${load.load_number}</p>
            ${load.bol_number ? `<p><strong>BOL Number:</strong> ${load.bol_number}</p>` : ''}
            <p><strong>Invoice Amount:</strong> $${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            ${attachments.length > 0 ? `<p><strong>Attachments:</strong> ${attachments.length} document(s)</p>` : ''}
          </div>
          
          <p>Thank you for your business!</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated email. Please do not reply directly to this message.
          </p>
        </div>
      `,
      attachments: attachments,
    };

    // Send email
    console.log(`[Email] Sending invoice ${invoice.invoice_number} to: ${allRecipients}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Email sent successfully: ${info.messageId}`);

    // Update invoice record with email info
    await supabase
      .from('invoices')
      .update({
        emailed_at: new Date().toISOString(),
        emailed_to: allRecipients,
      })
      .eq('id', invoice.id);
    
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
