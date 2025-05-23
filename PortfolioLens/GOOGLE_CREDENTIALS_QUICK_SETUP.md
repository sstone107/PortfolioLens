# Google Drive Sync - Quick Credential Setup

## Step 1: Get Your Service Account Key

If you already have a service account JSON key file, skip to Step 2.

Otherwise, create one:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Go to "IAM & Admin" > "Service Accounts"
4. Create a new service account or use existing
5. Click the service account > "Keys" tab > "Add Key" > "Create new key" > "JSON"
6. Save the downloaded file

## Step 2: Extract Credentials from JSON

Open your JSON key file and find these two fields:
```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEv...very long string...Q==\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service@your-project.iam.gserviceaccount.com",
  ...
}
```

You need:
- `client_email` → This is your GOOGLE_SERVICE_ACCOUNT_EMAIL
- `private_key` → This is your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

## Step 3: Add to Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project (PortfolioLens)
3. Go to "Edge Functions" in the left sidebar
4. Find `sync-google-drive` and click on it
5. Click "Secrets" or "Environment Variables"
6. Add these two secrets:

### GOOGLE_SERVICE_ACCOUNT_EMAIL
Copy the email from `client_email` field exactly as it appears.
Example: `portfoliolens-sync@my-project.iam.gserviceaccount.com`

### GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
Copy the ENTIRE private key including:
- The `-----BEGIN PRIVATE KEY-----` part
- All the characters in between
- The `-----END PRIVATE KEY-----` part
- All the `\n` characters (don't replace them with actual line breaks)

**IMPORTANT**: Copy it EXACTLY as it appears in the JSON file, including all `\n` characters.

## Step 4: Share Google Drive Folders

For each folder you want to sync:
1. Open Google Drive
2. Right-click the folder
3. Click "Share"
4. Paste the service account email (from Step 3)
5. Set permission to "Viewer"
6. Click "Send"

## Step 5: Test It

1. Go to `/import/google-drive-config` in your app
2. Click "Browse" on any folder
3. You should see the folder contents

## Troubleshooting

If you see "Invalid grant: account not found":
- Double-check the email matches exactly
- Ensure you copied the ENTIRE private key
- Verify the `\n` characters weren't converted to real line breaks
- Make sure the service account still exists in Google Cloud Console

If you see "No access to folder":
- Verify the folder is shared with the service account email
- Check that the service account has at least "Viewer" permission

## Common Mistakes

❌ **Wrong**: Copying private key with real line breaks
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC
...
-----END PRIVATE KEY-----
```

✅ **Correct**: Keeping the `\n` characters as-is
```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n
```

❌ **Wrong**: Partial key
```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B
```

✅ **Correct**: Complete key with BEGIN and END markers
```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B...very long string...8pkQ==\n-----END PRIVATE KEY-----\n
```