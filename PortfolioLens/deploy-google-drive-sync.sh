#\!/bin/bash

# Deploy the fixed Google Drive sync Edge Function

echo "Deploying fixed Google Drive sync Edge Function..."

# Make sure we are in the project directory
cd "$(dirname "$0")"

# Deploy the function
npx supabase functions deploy sync-google-drive --no-verify-jwt

echo "Deployment complete!"
echo ""
echo "⚠️  IMPORTANT: The Edge Function will not work until you configure Google credentials!"
echo ""
echo "Next steps:"
echo "1. Set the environment variables in Supabase Dashboard > Edge Functions > sync-google-drive > Secrets:"
echo "   - GOOGLE_SERVICE_ACCOUNT_EMAIL: your-service-account@project.iam.gserviceaccount.com"
echo "   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: (copy entire private key from JSON file including \\n characters)"
echo ""
echo "2. Share your Google Drive folders with the service account email (Viewer permission)"
echo ""
echo "3. Test by browsing a folder in the UI at /import/google-drive-config"
echo ""
echo "See GOOGLE_DRIVE_SETUP.md for detailed instructions"
