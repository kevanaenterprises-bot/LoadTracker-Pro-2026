# Railway Deployment Guide

## Prerequisites

- Railway account
- PostgreSQL database added to your Railway project

## Environment Variables

Set these environment variables in Railway:

```
DATABASE_URL=<automatically provided by Railway PostgreSQL>
JWT_SECRET=<long random string – see below>
VITE_API_URL=<your Railway app URL, e.g. https://yourapp.up.railway.app>
VITE_GOOGLE_CLOUD_VISION_API_KEY=<your Google API key>
HERE_API_KEY=<your HERE Maps API key>
OUTLOOK_USER=<your Outlook email (optional – for invoice emails)>
OUTLOOK_PASSWORD=<your Outlook app password (optional)>
```

### Generating a JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as `JWT_SECRET` in Railway. **Never commit this
value to version control.**

> ⚠️ **WARNING**: All active sessions are invalidated if you change JWT_SECRET.

## Deployment Steps

### 1. Deploy to Railway

Railway detects Node.js automatically and runs `npm run build` then `npm start`.

### 2. Run Database Migration

After the first deploy, run the schema migration once:

```bash
npm run migrate
```

In Railway you can execute this as a one-time command in the service settings.

### 3. Hash Existing Passwords (first deploy only)

If you have existing users with plaintext passwords, run:

```bash
DATABASE_URL=<your-url> node scripts/hash-passwords.js
```

This is safe to run multiple times – already-hashed passwords are skipped.

### 4. Update Default Admin Password

After migration, log in with `admin@example.com` / `admin123` and **immediately
change the password** via the Settings page or directly in the database.

### 5. Verify the Application

- Open `https://yourapp.up.railway.app`
- Log in with your admin credentials
- Confirm the dashboard loads and data is accessible

## Authentication

The application uses JWT-based authentication backed by Railway PostgreSQL.
Supabase has been fully removed.

### Login Flow

1. User POSTs `{ email, password }` to `/api/auth/login`
2. Server verifies the bcrypt password hash
3. Server returns a signed JWT (7-day expiry) and user object
4. Frontend stores the JWT in `localStorage` (`tms_token` key)
5. All subsequent API requests include `Authorization: Bearer <token>`

### Signup Flow

1. User POSTs `{ email, password, name, role }` to `/api/auth/signup`
2. Password is hashed with bcrypt (cost 12) before storage
3. Server returns a JWT + user object (same as login)

### Logout

The frontend removes `tms_token` and `tms_user` from `localStorage`.

## Database Schema

The migration creates the following tables:
- `users` – Authentication and user management (passwords stored as bcrypt hashes)
- `customers` – Customer information
- `drivers` – Driver profiles
- `loads` – Shipment data
- `load_stops` – Multiple stops per load
- `invoices` – Customer invoices
- `payments` – Payment records
- `locations` – Pickup and delivery locations
- `rate_matrix` – Rate configuration
- `pod_documents` – Proof of delivery documents
- `geofence_timestamps` – Automated timestamp tracking
- `ifta_trips` – IFTA trip records
- `ifta_trip_states` – State-by-state mileage
- `ifta_fuel_purchases` – Fuel purchase records
- `ifta_state_mileage` – IFTA reporting summary
- `driver_files` – Driver document management
- `ocr_training_data` – OCR results and corrections
- `demo_visitors` – Demo usage tracking
- `usage_tracking` – Application analytics

## Default Login

After migration the default admin account is:
- **Email**: admin@example.com
- **Password**: admin123

> ⚠️ **Change this password immediately after first login.**

## API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | No | Server health check |
| `POST /api/auth/login` | No | Authenticate, returns JWT |
| `POST /api/auth/signup` | No | Create account, returns JWT |
| `POST /api/query` | JWT | Generic parameterized SQL query |
| `POST /api/geocode` | No | Geocode an address |
| `POST /api/geocode-and-save` | JWT | Geocode and persist to DB |
| `POST /api/reverse-geocode` | No | Reverse-geocode coordinates |
| `POST /api/calculate-route` | No | Calculate truck route |
| `GET /api/here-config` | No | HERE Maps API key |
| `POST /api/send-invoice-email` | JWT | Send invoice email to customer |

## Troubleshooting

### "JWT_SECRET environment variable is not set"

Set `JWT_SECRET` in Railway environment variables and redeploy.

### Database Connection Issues

1. Verify `DATABASE_URL` is set correctly in Railway
2. Check the PostgreSQL service is running
3. Ensure SSL is configured for Railway connections

### "Invalid email or password" on Login

1. Run the password migration script if users were created before hashing was implemented
2. Verify the user exists in the `users` table

### Frontend Connection Issues

1. Verify `VITE_API_URL` is set to your Railway app URL
2. Check CORS settings in `server/index.js`
3. Ensure the frontend build is up to date (`npm run build`)

## Architecture

- **Frontend**: React + Vite + TypeScript
- **Backend**: Express.js API server
- **Database**: PostgreSQL (Railway)
- **Auth**: JWT + bcrypt (no Supabase)
- **Query Interface**: Custom SQL-builder compatibility layer
