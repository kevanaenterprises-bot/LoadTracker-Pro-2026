#!/bin/bash

# Frontend Migration Script
# This script updates your frontend to use the new backend API instead of Supabase Edge Functions

set -e  # Exit on error

FRONTEND_DIR=~/new-loadtracker-2026

echo "🔄 Migrating frontend code to use new backend API..."
echo ""

# Backup files first
echo "📦 Creating backups..."
cp "$FRONTEND_DIR/src/components/tms/LoadDetailsModal.tsx" "$FRONTEND_DIR/src/components/tms/LoadDetailsModal.tsx.backup"
cp "$FRONTEND_DIR/src/components/tms/SettingsView.tsx" "$FRONTEND_DIR/src/components/tms/SettingsView.tsx.backup"
echo "✅ Backups created (.backup files)"
echo ""

# Update LoadDetailsModal.tsx
echo "🔧 Updating LoadDetailsModal.tsx..."
sed -i '' '682s/.*/        const API_URL = import.meta.env.VITE_API_URL || '\''http:\/\/localhost:3001'\'';/' "$FRONTEND_DIR/src/components/tms/LoadDetailsModal.tsx"
sed -i '' '683s/.*/        const response = await fetch(`${API_URL}\/api\/send-invoice-email`, {/' "$FRONTEND_DIR/src/components/tms/LoadDetailsModal.tsx"
sed -i '' '684s/.*/          method: '\''POST'\'',/' "$FRONTEND_DIR/src/components/tms/LoadDetailsModal.tsx"
sed -i '' '684a\
          headers: { '\''Content-Type'\'': '\''application\/json'\'' },\
          body: JSON.stringify({ load_id: load.id }),\
        });\
        const data = await response.json();\
        const error = response.ok ? null : { message: data.error || '\''Failed to send email'\'' };
' "$FRONTEND_DIR/src/components/tms/LoadDetailsModal.tsx"

echo "✅ LoadDetailsModal.tsx updated"
echo ""

# Update SettingsView.tsx
echo "🔧 Updating SettingsView.tsx..."
sed -i '' '129s/.*/      const API_URL = import.meta.env.VITE_API_URL || '\''http:\/\/localhost:3001'\'';/' "$FRONTEND_DIR/src/components/tms/SettingsView.tsx"
sed -i '' '130s/.*/      const response = await fetch(`${API_URL}\/api\/send-invoice-email`, {/' "$FRONTEND_DIR/src/components/tms/SettingsView.tsx"
sed -i '' '131s/.*/        method: '\''POST'\'',/' "$FRONTEND_DIR/src/components/tms/SettingsView.tsx"
sed -i '' '131a\
        headers: { '\''Content-Type'\'': '\''application\/json'\'' },\
        body: JSON.stringify({ load_id: '\''__test__'\'', test_email: testEmailAddress }),\
      });\
      const data = await response.json();\
      const error = response.ok ? null : { message: data.error || '\''Test failed'\'' };
' "$FRONTEND_DIR/src/components/tms/SettingsView.tsx"

echo "✅ SettingsView.tsx updated"
echo ""

# Update or create .env file
echo "🔧 Updating environment variables..."
if [ ! -f "$FRONTEND_DIR/.env" ]; then
  echo "VITE_API_URL=http://localhost:3001" > "$FRONTEND_DIR/.env"
  echo "✅ Created .env file with VITE_API_URL"
else
  if ! grep -q "VITE_API_URL" "$FRONTEND_DIR/.env"; then
    echo "VITE_API_URL=http://localhost:3001" >> "$FRONTEND_DIR/.env"
    echo "✅ Added VITE_API_URL to .env"
  else
    echo "ℹ️  VITE_API_URL already exists in .env"
  fi
fi

echo ""
echo "✨ Migration complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review the changes in your editor"
echo "2. Set up your backend .env file with:"
echo "   - OUTLOOK_USER"
echo "   - OUTLOOK_PASS"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_KEY"
echo "3. Start backend: cd ~/LoadTracker-Pro-2026 && npm run dev"
echo "4. Start frontend: cd ~/new-loadtracker-2026 && npm run dev"
echo "5. Test the email functionality!"
echo ""
echo "💾 If you need to revert, .backup files are available"
