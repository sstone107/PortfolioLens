# Setting Up Google Drive Scheduled Sync

## Prerequisites

1. Google Drive sync must be configured and working manually
2. You need admin access to Supabase Dashboard
3. pg_cron and pg_net extensions must be enabled (the migration handles this)

## Step 1: Set Up Vault Secrets

The scheduled sync uses Supabase Vault to securely store your project URL and anon key. These are needed for cron jobs to call your Edge Functions.

### Via SQL Editor in Supabase Dashboard:

```sql
-- Replace these with your actual values
SELECT setup_sync_vault_secrets(
  'https://kukfbbaevndujnodafnk.supabase.co',  -- Your project URL
  ''                          -- Your project anon key
);
```

You can find these values in:
- **Project URL**: Settings > API > Project URL
- **Anon Key**: Settings > API > Project API keys > anon (public)

## Step 2: Enable Scheduling in UI

1. Go to Google Drive Config page
2. Edit a sync configuration
3. Enable "Enable automatic sync"
4. Enable "Enable scheduled sync"
5. Choose frequency:
   - **Hourly**: Runs at the start of every hour
   - **Daily**: Runs at 8 AM every day
   - **Weekly**: Runs at 8 AM every Monday
   - **Custom**: Enter your own cron expression

## Step 3: Verify Cron Job

Check if the cron job was created:

```sql
-- View all cron jobs
SELECT * FROM cron.job;

-- View job details for a specific config
SELECT * FROM cron.job 
WHERE jobname LIKE 'google_drive_sync_%';
```

## Step 4: Monitor Scheduled Syncs

View cron job execution history:

```sql
-- See recent job runs
SELECT 
  j.jobname,
  jrd.start_time,
  jrd.end_time,
  jrd.status,
  jrd.return_message
FROM cron.job j
JOIN cron.job_run_details jrd ON j.jobid = jrd.jobid
WHERE j.jobname LIKE 'google_drive_sync_%'
ORDER BY jrd.start_time DESC
LIMIT 20;
```

## Troubleshooting

### If scheduling fails:

1. **Check vault secrets are set:**
   ```sql
   SELECT * FROM vault.decrypted_secrets 
   WHERE name IN ('project_url', 'anon_key');
   ```

2. **Check pg_cron is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

3. **Manually test the cron job:**
   ```sql
   -- Replace with your config ID
   SELECT cron.schedule(
     'test_sync',
     '* * * * *',  -- Every minute for testing
     $$
     SELECT net.http_post(
       url := 'https://your-project.supabase.co/functions/v1/sync-google-drive',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer your-anon-key'
       ),
       body := jsonb_build_object('configId', 'your-config-id')
     );
     $$
   );
   
   -- Wait a minute, then check results
   SELECT * FROM cron.job_run_details 
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'test_sync')
   ORDER BY start_time DESC;
   
   -- Clean up test
   SELECT cron.unschedule('test_sync');
   ```

### Common Issues:

1. **"Extension not found"**: pg_cron might not be enabled in your Supabase plan
2. **"Function vault.create_secret does not exist"**: Vault might not be available in your plan
3. **"401 Unauthorized"**: Check that your anon key is correct
4. **"404 Not Found"**: Ensure Edge Function is deployed

## Manual Sync vs Scheduled Sync

- **Manual Sync**: Click "Sync Now" button - immediate execution
- **Scheduled Sync**: Runs automatically based on cron schedule
- Both use the same Edge Function and processing logic
- Scheduled syncs show up in import history just like manual syncs