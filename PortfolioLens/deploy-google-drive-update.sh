#\!/bin/bash

echo 'Deploying updated Google Drive sync Edge Function...'
cd "$(dirname "$0")"

npx supabase functions deploy sync-google-drive --no-verify-jwt

echo ''
echo '✅ Deployment complete\!'
echo ''
echo '⚠️  IMPORTANT: Configure Google credentials before using:'
echo ''
echo '1. In Supabase Dashboard, go to Edge Functions > sync-google-drive > Secrets'
echo '2. Add these environment variables:'
echo '   - GOOGLE_SERVICE_ACCOUNT_EMAIL'
echo '   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
echo ''
echo '3. See GOOGLE_DRIVE_SETUP.md for detailed instructions'
