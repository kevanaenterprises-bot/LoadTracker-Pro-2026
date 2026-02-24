# LoadTracker-Pro-2026 Backend

TMS dispatch email service using direct Outlook SMTP (bypassing Resend/Graph attachment limits)

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```
OUTLOOK_USER=your-email@outlook.com
OUTLOOK_PASS=your-app-password
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...your-service-role-key
```

**Getting Outlook App Password:**
1. Go to https://account.microsoft.com/security
2. Enable 2FA if not already enabled
3. Create App Password under "Security" → "Advanced security options"
4. Use that password (not your regular password)

**Getting Supabase Credentials:**
1. Go to your Supabase project dashboard
2. Settings → API
3. Copy Project URL (`SUPABASE_URL`)
4. Copy Service Role key (`SUPABASE_SERVICE_KEY`) - NOT the anon key

### 3. Migrate Frontend Code (Automated)

Run the migration script to update your frontend:
```bash
node migrate-frontend.js
```

Or manually follow [FRONTEND_MIGRATION_GUIDE.md](FRONTEND_MIGRATION_GUIDE.md)

### 4. Run Locally

```bash
npm run dev
```

Server will start on http://localhost:3001

### 5. Test

1. Start the backend (step 4)
2. Start your frontend: `cd ~/new-loadtracker-2026 && npm run dev`
3. Go to Settings → Test Email
4. Send a test invoice

## Deploy to Railway

### Backend Deployment

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Outlook SMTP email backend"
   git branch -M main
   git remote add origin https://github.com/yourusername/loadtracker-backend.git
   git push -u origin main
   ```

2. **Deploy to Railway:**
   - Go to [railway.app](https://railway.app)
   - Create New Project → Deploy from GitHub
   - Select your repository
   - Add environment variables:
     - `OUTLOOK_USER`
     - `OUTLOOK_PASS`
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY`
   - Deploy!

3. **Update Frontend .env for Production:**
   ```bash
   cd ~/new-loadtracker-2026
   echo "VITE_API_URL=https://your-app.railway.app" >> .env
   ```

## API Endpoints

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-23T22:00:00.000Z"
}
```

### Send Invoice Email
```
POST /api/send-invoice-email
```

**Request body (Main Usage):**
```json
{
  "load_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Request body (Test Email):**
```json
{
  "load_id": "__test__",
  "test_email": "test@example.com"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Invoice #12345 emailed successfully",
  "emailed_to": "customer@example.com",
  "invoice_number": "12345"
}
```

**Error Response:**
```json
{
  "error": "Failed to send invoice email",
  "details": "Customer email not found"
}
```

## How It Works

1. Frontend sends `load_id` to backend API
2. Backend fetches load/invoice/customer data from Supabase
3. Backend prepares email with invoice details
4. Backend sends email via Outlook SMTP (port 587, TLS)
5. Backend updates invoice status to "SENT"
6. Returns success/failure to frontend

## Benefits

✅ **No attachment limits** - Send large PDFs without restrictions  
✅ **Direct SMTP control** - No third-party API rate limits  
✅ **Reliable delivery** - Using official Outlook infrastructure  
✅ **Better logging** - Full visibility into email sending  
✅ **Cost effective** - No per-email charges  

## Troubleshooting

### "Authentication failed" error
- Make sure you're using an App Password, not your regular Outlook password
- Verify 2FA is enabled on your Microsoft account

### "Network error" or "Connection refused"
- Check that your backend server is running
- Verify `VITE_API_URL` in frontend .env points to correct backend URL
- For Railway: make sure the service is deployed and running

### "Customer email not found"
- Ensure the customer record has an email address in Supabase
- Check that customer is assigned to the load

### "Invoice not found"
- Generate an invoice for the load first before trying to send email

## Files Overview

- `server.js` - Main Express server, handles API endpoints
- `sendInvoiceEmail.js` - Nodemailer SMTP email function
- `migrate-frontend.js` - Automated frontend migration script
- `FRONTEND_MIGRATION_GUIDE.md` - Manual migration instructions
- `example-usage.js` - Example of how to call the API

## Support

For issues or questions, check the logs:
- Backend: Check terminal output where `npm run dev` is running
- Frontend: Check browser console (F12 → Console tab) 
