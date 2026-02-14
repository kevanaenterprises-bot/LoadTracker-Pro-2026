import express from 'express';
import cors from 'cors';
import pg from 'pg';
import rateLimit from 'express-rate-limit';
import hereApi from './hereApi.js';

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

// Apply rate limiting to all routes
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
