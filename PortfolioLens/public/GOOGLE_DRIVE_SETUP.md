# Google Drive Sync Setup Guide

## Overview
The Google Drive sync feature uses OAuth 2.0 with a service account to access restricted folders and automatically import files that match configured templates.

## Prerequisites
1. Google Cloud Console access
2. Access to the Google Drive folder you want to sync
3. Supabase project with Edge Functions enabled

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click on it and press "Enable"

## Step 2: Create a Service Account

1. In Google Cloud Console, go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Fill in:
   - Service account name: `portfoliolens-drive-sync`
   - Service account ID: (auto-generated)
   - Description: "Service account for PortfolioLens Google Drive sync"
4. Click "Create and Continue"
5. Skip the "Grant this service account access" step (click Continue)
6. Click "Done"

## Step 3: Create Service Account Key

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format
5. Click "Create" - this will download a JSON file with your credentials
6. **Keep this file secure!** It contains sensitive credentials

## Step 4: Extract Credentials from JSON

Open the downloaded JSON file and find these values:
- `client_email`: This is your service account email
- `private_key`: This is your private key (includes the BEGIN/END headers)

## Step 5: Share Google Drive Folder with Service Account

1. Go to Google Drive and find the folder you want to sync
2. Right-click on the folder and select "Share"
3. Add the service account email (from `client_email` in the JSON)
4. Grant "Viewer" permissions (read-only access)
5. Click "Send"

**Important**: The service account needs explicit access to each folder you want to sync.

## Step 6: Configure Supabase Edge Function

1. Go to your Supabase project dashboard
2. Navigate to "Edge Functions" > "Settings"
3. Add these environment variables:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYour private key content here\n-----END PRIVATE KEY-----
   ```

**Note**: Make sure the private key is exactly as it appears in the JSON file, including the newline characters (`\n`).

## Step 7: Deploy the Edge Function

```bash
supabase functions deploy sync-google-drive
```

## Step 8: Run Database Migration

Execute the migration to create the sync configuration tables:
```sql
-- Run the migration file: 044_google_drive_sync_config.sql
```

## Step 9: Configure Sync in the App

1. Navigate to `/import/google-drive-config` in PortfolioLens
2. Click "Add Configuration"
3. Enter:
   - **Google Drive Folder ID**: Get this from the folder URL
     - Example: If URL is `https://drive.google.com/drive/folders/1ABC123XYZ`, the ID is `1ABC123XYZ`
   - **Folder Name**: A friendly name like "Greenway Reporting"
   - **Import Template**: Select the template that matches the files in this folder
   - **File Pattern** (optional): Regex to filter files, e.g., `^2024.*\.xlsx$`
   - **Enable automatic sync**: Toggle on

## Usage

### Manual Sync
1. Go to the Import page
2. Click "Google Drive Sync" > "Sync All Configured Folders"
3. The system will:
   - Check each configured folder
   - Find new files that match the pattern
   - Download and import them using the specified template
   - Track them to avoid re-importing

### Automatic Sync (Future Enhancement)
Set up a scheduled job to run the sync automatically:
```bash
# Example cron job to sync every hour
0 * * * * curl -X POST https://your-project.supabase.co/functions/v1/sync-google-drive \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Troubleshooting

### "No access to folder" Error
- Ensure the service account email has been granted access to the folder
- Check that the folder ID is correct
- Verify the service account credentials are properly configured

### "Failed to obtain Google access token" Error
- Check that the service account email and private key are correctly set
- Ensure the private key includes the BEGIN/END headers
- Verify newline characters in the private key are preserved

### Files Not Being Imported
- Check the file pattern if configured
- Verify the template is correctly set up
- Look at the import history to see if files were already processed

## Security Notes

1. **Service Account Keys**: Keep the JSON key file secure and never commit it to version control
2. **Folder Permissions**: Only grant read-only access to the service account
3. **Environment Variables**: Use Supabase's secure environment variable storage
4. **Audit Trail**: All imports are logged with timestamps and user attribution