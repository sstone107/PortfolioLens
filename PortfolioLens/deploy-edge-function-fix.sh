#!/bin/bash

# Deploy the Edge Function with loan ID fixes

echo "Deploying Edge Function with loan ID fixes..."
echo ""
echo "Please run the following command with your Supabase access token:"
echo ""
echo "SUPABASE_ACCESS_TOKEN=your_token_here npx supabase functions deploy process-import-sheet --no-verify-jwt"
echo ""
echo "To get your access token:"
echo "1. Run: npx supabase login"
echo "2. Or get it from: https://app.supabase.com/account/tokens"
echo ""
echo "The Edge Function has been updated with:"
echo "- Fixed loan_id references to use ln_loan_information table"
echo "- Added default values for required fields (insurance_type, dates)"
echo "- Improved loan number extraction from original column names"
echo ""
echo "After deployment, test the import again and check the logs."