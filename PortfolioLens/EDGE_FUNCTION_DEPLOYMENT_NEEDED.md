# Edge Function Deployment Required

## What Changed

1. **sync-google-drive** function was updated to:
   - Use `max_depth` parameter from sync configuration
   - Call `process-import-sheet` instead of `process-excel-upload`
   - Better logging for depth-limited searches

## Deployment Steps

### Option 1: Via Supabase Dashboard
1. Go to your Supabase Dashboard
2. Navigate to Edge Functions
3. Find `sync-google-drive`
4. Click "Deploy" or "Update"
5. Upload the updated `/supabase/functions/sync-google-drive/index.ts`

### Option 2: Via Supabase CLI
```bash
# Login to Supabase (if not already logged in)
npx supabase login

# Deploy the specific function
npx supabase functions deploy sync-google-drive --project-ref kukfbbaevndujnodafnk
```

### Option 3: Deploy All Functions
```bash
# Deploy all functions at once
npx supabase functions deploy --project-ref kukfbbaevndujnodafnk
```

## Why This Is Important

Without deploying the updated Edge Function:
- The `max_depth` parameter won't be used (searches will still be slow)
- Files might not process correctly if `process-excel-upload` is deprecated
- You won't see the improved logging messages

## Verify Deployment

After deployment, test by:
1. Going to Google Drive Config page
2. Click "Test Pattern" on a config with subfolders enabled
3. Check that it respects the max_depth setting
4. Click "Sync Now" and verify files are processed

## Current Function Status

- **sync-google-drive**: Needs deployment ⚠️
- **process-import-sheet**: Already deployed ✓
- **scheduled-google-drive-sync**: Not yet implemented (for cron jobs)