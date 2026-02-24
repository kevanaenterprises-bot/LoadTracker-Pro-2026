# 🚀 Quick Setup Checklist

## ✅ Step-by-Step Setup

### Backend Setup (~/LoadTracker-Pro-2026)

- [ ] 1. Create `.env` file:
  ```bash
  cd ~/LoadTracker-Pro-2026
  cp .env.example .env
  ```

- [ ] 2. Edit `.env` and add your credentials:
  ```bash
  OUTLOOK_USER=your-email@outlook.com
  OUTLOOK_PASS=your-app-password  # Get from account.microsoft.com/security
  PORT=3001
  SUPABASE_URL=https://your-project.supabase.co  # From Supabase dashboard
  SUPABASE_SERVICE_KEY=eyJhbG...  # From Supabase dashboard → Settings → API
  ```

- [ ] 3. Test backend locally:
  ```bash
  npm run dev
  ```
  
  You should see:
  ```
  ✅ Server running on port 3001
  📧 Email service ready with Outlook SMTP
  🔗 Supabase connected: Yes
  ```

---

### Frontend Migration (~/new-loadtracker-2026)

- [ ] 4. Run automated migration:
  ```bash
  cd ~/LoadTracker-Pro-2026
  node migrate-frontend.js
  ```

- [ ] 5. Verify the frontend `.env` file has:
  ```bash
  cd ~/new-loadtracker-2026
  cat .env | grep VITE_API_URL
  ```
  
  Should show:
  ```
  VITE_API_URL=http://localhost:3001
  ```

- [ ] 6. Start frontend
 (in a new terminal):
  ```bash
  cd ~/new-loadtracker-2026
  npm run dev
  ```

---

### Testing

- [ ] 7. Test email in your app:
  - Open browser to your frontend (usually http://localhost:5173)
  - Go to **Settings** page
  - Scroll to "Test Email" section
  - Enter your email
  - Click "Send Test Email"
  - Check that you receive the test email

- [ ] 8. Send a real invoice:
  - Find a DELIVERED load
  - Generate invoice (if not already generated)
  - Click "Send Invoice Email"
  - Verify:
    - Customer receives invoice
    - CC emails receive copy (kevin@go4fc.com, gofarmsbills@gmail.com, esubmit@afs.net)
    - Email has PDF attachment
    - No attachment size errors

---

### Railway Deployment (Production)

- [ ] 9. Create GitHub repo for backend:
  ```bash
  cd ~/LoadTracker-Pro-2026
  git init
  git add .
  git commit -m "Initial commit - Outlook SMTP backend"
  git remote add origin https://github.com/YOUR_USERNAME/loadtracker-backend.git
  git push -u origin main
  ```

- [ ] 10. Deploy to Railway:
  - Go to https://railway.app
  - Click "New Project" → "Deploy from GitHub"
  - Select your backend repo
  - After deployment, go to "Variables" tab
  - Add all 4 environment variables:
    - `OUTLOOK_USER`
    - `OUTLOOK_PASS`
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_KEY`
  - Railway will auto-redeploy

- [ ] 11. Update frontend for production:
  ```bash
  cd ~/new-loadtracker-2026
  # Edit .env and change VITE_API_URL to your Railway URL
  # e.g., VITE_API_URL=https://loadtracker-backend.railway.app
  ```

- [ ] 12. Rebuild and redeploy frontend

---

## 📝 What Was Changed

### Files Created/Modified:
- ✅ `~/LoadTracker-Pro-2026/server.js` - Main backend server
- ✅ `~/LoadTracker-Pro-2026/sendInvoiceEmail.js` - SMTP email function
- ✅ `~/LoadTracker-Pro-2026/package.json` - Dependencies
- ✅ `~/LoadTracker-Pro-2026/.env.example` - Environment template
- ✅ `~/LoadTracker-Pro-2026/migrate-frontend.js` - Migration script
- ✅ `~/LoadTracker-Pro-2026/README.md` - Documentation
- ✅ `~/LoadTracker-Pro-2026/FRONTEND_MIGRATION_GUIDE.md` - Migration guide
- ✅ `~/new-loadtracker-2026/src/components/tms/LoadDetailsModal.tsx` - Updated to call new API
- ✅ `~/new-loadtracker-2026/src/components/tms/SettingsView.tsx` - Updated to call new API
- ✅ `~/new-loadtracker-2026/.env` - Added VITE_API_URL

### What Changed:
- ❌ **OLD**: `await supabase.functions.invoke('send-invoice-email', ...)`
- ✅ **NEW**: `await fetch('http://localhost:3001/api/send-invoice-email', ...)`

---

## 🎯 Benefits You Get

1. **No more attachment limits** 📎
   - Send PDFs of any size
   - No restrictions from Resend/Graph

2. **Direct Outlook SMTP** 📧
   - Reliable delivery
   - Professional email sender

3. **Better control** 🎛️
   - Full server logs
   - Error visibility
   - Custom email formatting

4. **Cost effective** 💰
   - No per-email charges
   - Use your existing Outlook account

---

## 🆘 Troubleshooting

### Can't connect to backend
```bash
# Check backend is running:
curl http://localhost:3001/health

# Should return:
{"status":"ok","timestamp":"..."}
```

### Email not sending
- Check backend terminal logs for errors
- Verify Outlook credentials in `.env`
- Test SMTP credentials at https://www.smtper.net/

### Frontend still using old Edge Function
- Make sure migration script ran successfully
- Check for `.backup` files (backups of original code)
- Verify VITE_API_URL is set in frontend `.env`

---

## 📞 Need Help?

Check detailed docs:
- [README.md](README.md) - Complete documentation
- [FRONTEND_MIGRATION_GUIDE.md](FRONTEND_MIGRATION_GUIDE.md) - Manual migration steps
- Backend logs - Terminal where `npm run dev` is running
- Frontend logs - Browser console (F12)

---

**Ready to start?** Begin with Step 1! ☝️
