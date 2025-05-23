# Edge Function Deployment Guide

## Issue
The import system shows an error: "Import Function Unavailable: The server-side import processor is not accessible."

The Edge Function is returning a 500 Internal Server Error when the health check tries to test it.

## Solution
The Edge Function needs to be updated and redeployed. The function was missing proper handling for test requests from the health check.

## Changes Made

1. **Added test request handling** in `/supabase/functions/process-import-sheet/index.ts`:
   ```typescript
   // Handle test request from health check
   if (body.test === true) {
     return new Response(
       JSON.stringify({ status: 'ok', test: true }),
       { 
         headers: { 
           ...corsHeaders, 
           'Content-Type': 'application/json' 
         } 
       }
     )
   }
   ```

2. **Fixed request body parsing** to handle both test requests and normal import requests.

## Deployment Steps

### Option 1: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** if not already installed:
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Deploy the Edge Function**:
   ```bash
   cd /path/to/PortfolioLens
   supabase functions deploy process-import-sheet --no-verify-jwt
   ```

### Option 2: Using Deployment Script

1. **Run the deployment script**:
   ```bash
   cd /path/to/PortfolioLens
   ./deploy-edge-function.sh
   ```

### Option 3: Manual Deployment via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to "Edge Functions" section
3. Find "process-import-sheet" function
4. Click "Edit" or "Deploy new version"
5. Copy the contents of `/supabase/functions/process-import-sheet/index.ts`
6. Paste and deploy

## Verification

After deployment, the import system should work without errors. The health check will show:
- ✅ Edge Function is available and authentication is working

Instead of:
- ❌ Import Function Unavailable

## Troubleshooting

If the deployment fails:

1. **Check Supabase CLI is installed**:
   ```bash
   supabase --version
   ```

2. **Verify you're logged in**:
   ```bash
   supabase projects list
   ```

3. **Check the function logs**:
   ```bash
   supabase functions logs process-import-sheet
   ```

4. **Manual deployment**: If CLI deployment fails, use the Supabase Dashboard to manually update the function.

## Function Details

- **Name**: process-import-sheet
- **Purpose**: Processes Excel/CSV imports in the background
- **Authentication**: Uses Supabase service role key (no JWT verification needed)
- **CORS**: Enabled for all origins

## Important Notes

- The `--no-verify-jwt` flag is crucial as the function uses service role authentication
- The function handles both health checks and actual import processing
- All imported tables are automatically prefixed with `ln_` for consistency