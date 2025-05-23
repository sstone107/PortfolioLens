# Debugging Google Drive Sync Issue

## Problem
When clicking "Sync Now":
1. Files are found successfully
2. Import job appears to be created
3. User is redirected to /import/history
4. But the job doesn't appear in the history
5. No Edge Function logs are showing

## Debugging Steps

### 1. Check if import job was created
Run this in Supabase SQL Editor:
```sql
-- Check recent import jobs
SELECT 
  id,
  filename,
  status,
  template_id,
  created_at,
  error_message,
  bucket_path,
  source_metadata
FROM import_jobs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Check Google Drive sync history
```sql
-- Check sync history
SELECT 
  sh.*,
  ij.status as job_status,
  ij.error_message as job_error
FROM google_drive_sync_history sh
LEFT JOIN import_jobs ij ON ij.id = sh.import_job_id
WHERE sh.created_at > NOW() - INTERVAL '1 hour'
ORDER BY sh.created_at DESC
LIMIT 10;
```

### 3. Check if process-import-sheet is deployed
The sync-google-drive function is trying to call `process-import-sheet` but it might not be deployed.

Check deployed functions:
- Go to Supabase Dashboard > Edge Functions
- Look for `process-import-sheet` - is it there and deployed?

### 4. Deploy process-import-sheet if needed
```bash
npx supabase functions deploy process-import-sheet --project-ref kukfbbaevndujnodafnk
```

### 5. Check if files were uploaded to storage
```sql
-- Check recent uploads to imports bucket
SELECT 
  name,
  created_at,
  metadata
FROM storage.objects
WHERE bucket_id = 'imports'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

### 6. Manual test of process-import-sheet
If you find an import job ID from step 1, try manually calling the Edge Function:

```javascript
// In browser console on your app
const { data, error } = await supabase.functions.invoke('process-import-sheet', {
  body: { 
    jobId: 'YOUR-JOB-ID-HERE',
    templateId: 'YOUR-TEMPLATE-ID-HERE'
  }
});
console.log('Result:', data);
console.log('Error:', error);
```

### 7. Check Edge Function logs with more detail
After running a sync, immediately check:
```sql
-- Get all Edge Function invocations from last 5 minutes
SELECT 
  function_name,
  status,
  created_at,
  response_status_code,
  error_message
FROM analytics.function_invocations
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

## Possible Issues

1. **process-import-sheet not deployed**: The Edge Function being called doesn't exist
2. **Permission issues**: The Edge Function can't access storage or database
3. **File upload failing**: The file isn't being saved to storage properly
4. **Template ID mismatch**: The template_id might not match the expected format

## Quick Fix Attempt

Try updating sync-google-drive to use a different processing approach:

1. Instead of calling process-import-sheet, update the job status directly
2. Or call a different Edge Function that is known to work

## Alternative: Direct Processing

If Edge Functions continue to fail, consider:
1. Processing files directly in the sync-google-drive function
2. Using a database trigger to process new import_jobs
3. Setting up a cron job to process pending imports