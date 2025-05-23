# Deploying the Google Drive Sync Edge Function

Since you're getting CORS errors, the Edge Function needs to be deployed. Here's how:

## Option 1: Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** 
3. Click **New Function**
4. Name: `sync-google-drive`
5. Copy the entire contents of `/supabase/functions/sync-google-drive/index.ts`
6. Paste into the editor
7. Click **Deploy**

## Option 2: Supabase CLI

First, login to Supabase:
```bash
npx supabase login
```

Then deploy:
```bash
cd PortfolioLens
npx supabase functions deploy sync-google-drive --project-ref kukfbbaevndujnodafnk
```

## Option 3: Direct API Deploy

If the above don't work, you can use the Supabase Management API directly.

## Verify Deployment

After deployment, you should see:
- The function listed in Edge Functions section
- Status should be "Active"
- The secrets you set earlier should be available to the function

## Test the Function

Once deployed, try the browse feature again. If you still get errors:

1. Check the Edge Function logs in Supabase Dashboard
2. Look for authentication errors
3. Verify the service account has access to the Google Drive folder

## Common Issues

1. **Function not found** - Not deployed correctly
2. **Auth errors** - Check the private key format
3. **403 errors** - Service account needs folder access