# Setting Google Service Account Private Key in Supabase

## The Private Key Format Issue

The Google service account private key is a multi-line RSA key that looks like this in the JSON file:

```json
{
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n...(many lines)...\n-----END PRIVATE KEY-----\n"
}
```

## How to Set it in Supabase Dashboard

1. **Open your service account JSON file** in a text editor

2. **Find the `private_key` field** - it will be a very long string with `\n` characters

3. **Copy the ENTIRE value** including:
   - The opening `-----BEGIN PRIVATE KEY-----`
   - All the characters in between (with `\n` symbols)
   - The closing `-----END PRIVATE KEY-----`

4. **In Supabase Dashboard:**
   - Go to Edge Functions > sync-google-drive > Secrets
   - Add new secret: `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
   - Paste the entire private key value
   - **DO NOT** add extra quotes around it

## Example of What to Copy

From your JSON file, copy this entire value:
```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n...\n-----END PRIVATE KEY-----\n
```

## Common Mistakes to Avoid

❌ **DON'T** remove the `\n` characters  
❌ **DON'T** add extra quotes around the value  
❌ **DON'T** try to format it as multiple lines  
❌ **DON'T** copy just the middle part without BEGIN/END headers  

✅ **DO** copy the exact value from the JSON including all `\n` characters  
✅ **DO** include the BEGIN and END headers  
✅ **DO** paste it as one long string  

## Alternative: Using Supabase CLI

If the dashboard is giving you trouble, you can use the CLI:

```bash
# Set the private key using CLI (be careful with escaping)
supabase secrets set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n" --project-ref kukfbbaevndujnodafnk

# Set the email
supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com" --project-ref kukfbbaevndujnodafnk
```

## Verify Your Setup

After setting the secrets, you can verify they're set correctly:

1. In Supabase Dashboard, go to Edge Functions > sync-google-drive > Secrets
2. You should see both secrets listed (values will be hidden)
3. Try the browse feature - if it works, the auth is set up correctly!

## Troubleshooting

If you get authentication errors:

1. **"Failed to obtain Google access token"**
   - The private key format is incorrect
   - Check that you included the BEGIN/END headers
   - Ensure all `\n` characters are present

2. **"No access to folder"**
   - The service account doesn't have access to the folder
   - Share the Google Drive folder with the service account email

3. **CORS errors**
   - The Edge Function isn't deployed
   - Run: `supabase functions deploy sync-google-drive`