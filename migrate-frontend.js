const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(require('os').homedir(), 'new-loadtracker-2026');

console.log('🔄 Migrating frontend code to use new backend API...\n');

// Backup and update LoadDetailsModal.tsx
console.log('📦 Updating LoadDetailsModal.tsx...');
const loadDetailsPath = path.join(FRONTEND_DIR, 'src/components/tms/LoadDetailsModal.tsx');
let loadDetailsContent = fs.readFileSync(loadDetailsPath, 'utf8');

// Create backup
fs.writeFileSync(loadDetailsPath + '.backup', loadDetailsContent);

// Replace the Supabase Edge Function call
const loadDetailsOld = `        const { data, error } = await db.functions.invoke('send-invoice-email', {
          body: { load_id: load.id },
        });`;

const loadDetailsNew = `        // Call new backend API instead of Supabase Edge Function
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(\`\${API_URL}/api/send-invoice-email\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ load_id: load.id }),
        });
        const data = await response.json();
        const error = response.ok ? null : { message: data.error || 'Failed to send email' };`;

if (loadDetailsContent.includes(loadDetailsOld)) {
  loadDetailsContent = loadDetailsContent.replace(loadDetailsOld, loadDetailsNew);
  fs.writeFileSync(loadDetailsPath, loadDetailsContent);
  console.log('✅ LoadDetailsModal.tsx updated\n');
} else {
  console.log('⚠️  Could not find exact match in LoadDetailsModal.tsx - may need manual update\n');
}

// Backup and update SettingsView.tsx
console.log('📦 Updating SettingsView.tsx...');
const settingsPath = path.join(FRONTEND_DIR, 'src/components/tms/SettingsView.tsx');
let settingsContent = fs.readFileSync(settingsPath, 'utf8');

// Create backup
fs.writeFileSync(settingsPath + '.backup', settingsContent);

// Replace the Supabase Edge Function call
const settingsOld = `      const { data, error } = await db.functions.invoke('send-invoice-email', {
        body: { load_id: '__test__', test_email: testEmailAddress },
      });`;

const settingsNew = `      // Call new backend API instead of Supabase Edge Function
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(\`\${API_URL}/api/send-invoice-email\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load_id: '__test__', test_email: testEmailAddress }),
      });
      const data = await response.json();
      const error = response.ok ? null : { message: data.error || 'Test failed' };`;

if (settingsContent.includes(settingsOld)) {
  settingsContent = settingsContent.replace(settingsOld, settingsNew);
  fs.writeFileSync(settingsPath, settingsContent);
  console.log('✅ SettingsView.tsx updated\n');
} else {
  console.log('⚠️  Could not find exact match in SettingsView.tsx - may need manual update\n');
}

// Update .env file
console.log('🔧 Updating environment variables...');
const envPath = path.join(FRONTEND_DIR, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

if (!envContent.includes('VITE_API_URL')) {
  envContent += '\n# Backend API URL\nVITE_API_URL=http://localhost:3001\n';
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Added VITE_API_URL to .env\n');
} else {
  console.log('ℹ️  VITE_API_URL already exists in .env\n');
}

console.log('✨ Migration complete!\n');
console.log('📋 Next steps:');
console.log('1. Review the changes in your editor');
console.log('2. Set up your backend .env file (~/LoadTracker-Pro-2026/.env) with:');
console.log('   - OUTLOOK_USER=your-email@outlook.com');
console.log('   - OUTLOOK_PASS=your-app-password');
console.log('   - SUPABASE_URL=https://your-project.supabase.co');
console.log('   - SUPABASE_SERVICE_KEY=your-service-role-key');
console.log('3. Start backend: cd ~/LoadTracker-Pro-2026 && npm run dev');
console.log('4. Start frontend: cd ~/new-loadtracker-2026 && npm run dev');
console.log('5. Test the email functionality!');
console.log('\n💾 Backups saved as .backup files');
