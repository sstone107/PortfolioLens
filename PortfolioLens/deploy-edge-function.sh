#!/bin/bash

# Deploy Edge Function Script
# This script deploys the process-import-sheet Edge Function to Supabase

echo "Deploying process-import-sheet Edge Function..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is not installed."
    echo "Please install it from: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Deploy the function
supabase functions deploy process-import-sheet --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ Edge Function deployed successfully!"
    echo ""
    echo "The function has been deployed with the following updates:"
    echo "- Added test request handling for health checks"
    echo "- Fixed CORS headers"
    echo "- Improved error handling"
else
    echo "❌ Edge Function deployment failed!"
    echo "Please check the error messages above."
    exit 1
fi