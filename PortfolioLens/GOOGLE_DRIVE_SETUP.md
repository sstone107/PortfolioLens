# Google Drive Sync Setup Guide

## Prerequisites

1. Google Cloud Project with Drive API enabled
2. Service Account with appropriate permissions
3. Supabase project with Edge Functions enabled

## Step 1: Create Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select or create a project
3. Navigate to "IAM & Admin" > "Service Accounts"
4. Click "Create Service Account"
   - Name: `portfoliolens-drive-sync`
   - Description: "Service account for PortfolioLens Google Drive sync"
5. Click "Create and Continue"
6. Skip role assignment (we'll use Drive folder sharing instead)
7. Click "Done"

## Step 2: Create Service Account Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format
5. Download the key file (keep it secure!)

## Step 3: Extract Credentials from Key File

Open the downloaded JSON file and find:
- `client_email` - This is your GOOGLE_SERVICE_ACCOUNT_EMAIL
- `private_key` - This is your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

## Step 4: Configure Supabase Edge Function

1. Go to your Supabase Dashboard
2. Navigate to "Edge Functions" 
3. Find `sync-google-drive` function
4. Click on "Secrets" or "Environment Variables"
5. Add the following secrets:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEv...(your full private key)...\n-----END PRIVATE KEY-----\n
   ```

   **Important**: Copy the private key exactly as it appears in the JSON file, including the `\n` characters.

## Step 5: Share Google Drive Folders

For each folder you want to sync:
1. Open Google Drive
2. Right-click the folder
3. Click "Share"
4. Add the service account email (from Step 4)
5. Give "Viewer" permission (read-only access)

## Step 6: Test the Setup

1. Deploy the Edge Function:
   ```bash
   npx supabase functions deploy sync-google-drive --no-verify-jwt
   ```

2. Check the logs:
   ```bash
   npx supabase functions logs sync-google-drive
   ```

3. Try browsing a folder in the UI - you should see:
   - "Service account email: configured"
   - "Private key: configured"
   - Successful folder listing

## Troubleshooting

### "Google service account credentials not configured"
- Check that environment variables are set in Supabase Dashboard
- Ensure variable names are exactly: `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### "No access to folder"
- Verify the service account email has been granted access to the folder
- Check that the folder ID is correct
- Ensure the service account has at least "Viewer" permission

### Private key parsing errors
- Make sure the private key includes the full BEGIN/END markers
- Verify the `\n` characters are preserved in the environment variable
- Try copying the private key again from the original JSON file

### JWT creation errors
- Ensure the private key is in PKCS#8 format (standard for Google service accounts)
- Check that the key hasn't been truncated or modified

## Security Notes

- Never commit service account keys to version control
- Rotate keys periodically
- Use least-privilege access (only share specific folders needed)
- Monitor usage in Google Cloud Console