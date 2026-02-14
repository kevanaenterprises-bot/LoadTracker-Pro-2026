# Railway Deployment Guide

## Prerequisites

- Railway account
- PostgreSQL database added to your Railway project

## Environment Variables

Set these environment variables in Railway:

```
DATABASE_URL=<your-railway-postgresql-url>
VITE_API_URL=<your-railway-app-url>
VITE_GOOGLE_CLOUD_VISION_API_KEY=<your-google-api-key>
```

The `DATABASE_URL` is automatically provided by Railway when you add a PostgreSQL database.

## Deployment Steps

### 1. Deploy to Railway

Railway will automatically detect the Node.js application and build it.

### 2. Run Database Migration

After deploying, run the migration script to create all database tables:

```bash
npm run migrate
```

Or in Railway, you can run this as a one-time command or add it to your start script.

### 3. Verify Database

Check that the database tables were created successfully:
- The migration script will output confirmation messages
- Verify the default admin user exists: `admin@example.com` / `admin123`

### 4. Start the Application

The application consists of two parts:
- **API Server**: Runs on port defined by `PORT` environment variable (Railway provides this)
- **Frontend**: Static React app served by the API server in production

In development:
```bash
# Run both API server and frontend
npm run dev:all

# Or run them separately
npm run dev:server  # API server on port 3001
npm run dev         # Frontend on port 8080
```

In production (Railway):
```bash
npm start  # Starts the API server
```

## Database Schema

The migration creates the following tables:
- `users` - Authentication and user management
- `customers` - Customer information
- `drivers` - Driver profiles
- `loads` - Shipment data
- `load_stops` - Multiple stops per load
- `invoices` - Customer invoices
- `payments` - Payment records
- `locations` - Pickup and delivery locations
- `rate_matrix` - Rate configuration
- `pod_documents` - Proof of delivery documents
- `geofence_timestamps` - Automated timestamp tracking
- `ifta_trips` - IFTA trip records
- `ifta_trip_states` - State-by-state mileage
- `ifta_fuel_purchases` - Fuel purchase records
- `ifta_state_mileage` - IFTA reporting summary
- `driver_files` - Driver document management
- `ocr_training_data` - OCR results and corrections
- `demo_visitors` - Demo usage tracking
- `usage_tracking` - Application analytics

## Default Login

After running the migration, you can log in with:
- **Email**: admin@example.com
- **Password**: admin123

**Important**: Change this password after first login!

## API Endpoints

The API server provides these endpoints:

- `GET /api/health` - Health check
- `POST /api/query` - Generic query endpoint (used by frontend)

## Architecture

The application uses:
- **Frontend**: React + Vite + TypeScript
- **Backend**: Express.js API server
- **Database**: PostgreSQL (Railway)
- **Query Interface**: Custom compatibility layer that mimics Supabase's query builder

## Troubleshooting

### Database Connection Issues

If you see database connection errors:
1. Verify `DATABASE_URL` is set correctly in Railway
2. Check that the PostgreSQL service is running
3. Ensure SSL is configured properly for Railway connections

### Migration Errors

If the migration fails:
1. Check the migration script output for specific errors
2. Verify PostgreSQL version compatibility (requires UUID extension)
3. Ensure the database user has CREATE TABLE permissions

### Frontend Connection Issues

If the frontend can't connect to the API:
1. Verify `VITE_API_URL` is set to your Railway app URL
2. Check CORS settings in `server/index.js`
3. Ensure both frontend and backend are deployed correctly
