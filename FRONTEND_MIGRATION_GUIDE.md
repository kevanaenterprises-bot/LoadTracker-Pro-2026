# Frontend Migration Guide

## Overview
Replace Supabase Edge Function calls with direct API calls to your new backend.

## Files to Update

### 1. `src/components/tms/LoadDetailsModal.tsx`

**Find this code (around line 750):**
```typescript
const { data, error } = await db.functions.invoke('send-invoice-email', {
  body: { load_id: load.id },
});
```

**Replace with:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const response = await fetch(`${API_URL}/api/send-invoice-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ load_id: load.id }),
});

const data = await response.json();
const error = response.ok ? null : new Error(data.error || 'Failed to send email');
```

---

### 2. `src/components/tms/SettingsView.tsx`

**Find this code (test email section):**
```typescript
const { data, error } = await db.functions.invoke('send-invoice-email', {
  body: { load_id: '__test__', test_email: testEmailAddress },
});
```

**Replace with:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const response = await fetch(`${API_URL}/api/send-invoice-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ 
    load_id: '__test__', 
    test_email: testEmailAddress 
  }),
});

const data = await response.json();
const error = response.ok ? null : new Error(data.error || 'Test failed');
```

---

## Update Environment Variables

### In `new-loadtracker-2026/.env`:

```bash
# Your backend URL (local development)
VITE_API_URL=http://localhost:3001

# For production (Railway):
VITE_API_URL=https://your-app.railway.app
```

### In `LoadTracker-Pro-2026/.env`:

```bash
OUTLOOK_USER=your-email@outlook.com
OUTLOOK_PASS=your-app-password
PORT=3001

# Your Supabase credentials (get these from supabase.com dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUz...your-service-role-key
```

---

## Testing Steps

1. **Start the backend:**
   ```bash
   cd ~/LoadTracker-Pro-2026
   npm run dev
   ```

2. **Update frontend .env with backend URL:**
   ```bash
   cd ~/new-loadtracker-2026
   echo "VITE_API_URL=http://localhost:3001" >> .env
   ```

3. **Test the email functionality:**
   - Go to Settings → Test Email
   - Should now use your Outlook SMTP instead of Resend

4. **Send a real invoice:**
   - Open a load with DELIVERED status
   - Generate invoice
   - Click "Send Invoice"
   - Should email directly via Outlook with PDF attachment

---

## Railway Deployment

1. **Push backend to GitHub**
2. **In Railway dashboard:**
   - Add environment variables:
     - `OUTLOOK_USER`
     - `OUTLOOK_PASS`
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY`
3. **Update frontend .env for production:**
   ```
   VITE_API_URL=https://your-app.railway.app
   ```

---

## Benefits

✅ No more Resend/Graph attachment limits  
✅ Direct Outlook SMTP control  
✅ No cold starts (Railway keeps your server running)  
✅ Better error handling and logging  
✅ Same interface as before - minimal code changes  
