# Setting Up Automatic Google Drive Sync

## Option 1: Using Supabase Cron (Recommended)

### 1. Deploy the scheduled function
```bash
npx supabase functions deploy scheduled-google-drive-sync --no-verify-jwt
```

### 2. Set up a Cron job in Supabase

Unfortunately, Supabase doesn't have built-in cron jobs yet. You'll need to use an external service:

## Option 2: Using GitHub Actions (Free)

Create `.github/workflows/google-drive-sync.yml`:

```yaml
name: Google Drive Sync
on:
  schedule:
    # Run every hour at minute 15
    - cron: '15 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Google Drive Sync
        run: |
          curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/scheduled-google-drive-sync \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

Add secret in GitHub:
- `CRON_SECRET`: A secret token you create

## Option 3: Using Vercel Cron (If using Vercel)

In `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/sync-google-drive",
    "schedule": "0 * * * *"
  }]
}
```

## Option 4: Using External Cron Services

### EasyCron.com (Free tier available)
1. Create account at easycron.com
2. Add new cron job:
   - URL: `https://YOUR_PROJECT.supabase.co/functions/v1/scheduled-google-drive-sync`
   - Method: POST
   - Headers: `Authorization: Bearer YOUR_CRON_SECRET`
   - Schedule: Every hour (or as needed)

### Cron-job.org (Free)
1. Create account at cron-job.org
2. Create new cronjob with same settings as above

## Recommended Sync Frequencies

Based on your use case:
- **Real-time critical**: Every 15 minutes
- **Daily reporting**: Every hour during business hours (9 AM - 6 PM)
- **Standard processing**: Every 2-4 hours
- **Low priority**: Once or twice daily

## Monitoring

Create a simple monitoring table:

```sql
CREATE TABLE scheduled_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT,
  results JSONB,
  error_message TEXT
);
```

## Setting Sync Frequency Based on Time Window

- If syncing **every hour**: Set `hoursBack: 2` (overlap for safety)
- If syncing **every 4 hours**: Set `hoursBack: 5`
- If syncing **daily**: Set `hoursBack: 25`

The overlap ensures you don't miss files due to timing differences.