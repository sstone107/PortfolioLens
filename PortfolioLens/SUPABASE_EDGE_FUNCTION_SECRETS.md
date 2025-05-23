# Supabase Edge Function Secrets Configuration

## Your Google Service Account Credentials

Based on your JSON file, here are the exact values you need to set in Supabase:

### GOOGLE_SERVICE_ACCOUNT_EMAIL
```
portfoliolens-drive-sync@greenway-452013.iam.gserviceaccount.com
```

### GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```
-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDMxbej42EoKWVn\n3my2KvFHlFk05T2SBjIPebq0lkksfj0b80EIxbK+IrnsZ9A8cKhF/iUfykIQwmLR\nYijN0z/2pygsOX811+wdfkTu0BL6/dFMYcIHbg4f6HIYrugijh39W5iJz3xpIhta\n1jA/T6E3B/aVsZnaMkieqnQYpDaf4WvKwHkOryjGofiIed+nUMu2m882HYhhUo0l\n2Vbe7+jRLZTejfunSS2iU9RwRPIUsLjDk8QaYzG2kN/HSNPYNbMLrKjspP/dL6Ga\n95ajcmzxQMze+B+MSTsOJcuJGeYMUfM0I8ktci9LodTm41Te8ZpS9Y2S+l2yCpCp\nWDo7ReWvAgMBAAECggEAAg8e6Jv5tyCrb17yMua9pF2ehASmGNjNGhC8SuKT+8mN\nLcHFbqQmRvksa28jzefIGWQT1X0AKxD5U2esR12PcBiAM+mkGNOCAU3qvYgEGNgC\nicUV4WM+6x04QH1JwkcxkAGiyAf5FUmNgt1SgOB5G4eN+DVf+ay1xDqsji7gib0C\n7JJuMWqEh7lCcjg2AtYEsF7Jp2nDzbEXhhURZvXEM+b0DLXbF174yOB3wsFz0tfM\nA955hqUP9iplrVjov7jQQX5GSTrfL+BmcqxPCatr5l2TLkTeIarO58UZloV+s7Ew\n9bMEg4enTg5Dg10joo79Pww+BANCxn7i3G8Tt2jVgQKBgQD468d9ryzLZWZbarsr\nW7P2dFRkMaRU1aJjg8pFD+S9yFPRYvMGXjsM15QYSy8OJVVNuMjzJmBiIndXeN0L\nmg4zvTUqtRE6qS71gZkArOvADYk0o/RtRoLGXndTDOGLWRIE3hJZ0BwGB0eSN/6m\nu2KuS4rO0L0fFUdM0jzCUbXvwQKBgQDSmIWyyg/Jqx+T/sz866ZXPpj8nV3sqs5h\nHcAFwWG7rFW0EyTw7JNP2vdtMvzNrXcN8JMcqGt2JHhhK56iUPiAWk2f0VlWlnH6\nioIMdDYKl8gWJ5J/LO/MpM1otIQExrbv7r6b012bM212fnhMXM8YTMNKggjiQHBi\nBDGNej8xbwKBgQClDLmPFdsu1oJjNUb7/ec7EHFwqhXbhngRYi55UouKZ01kdibM\nXyjqX/s7jIab65c/XLopt5WLHG1jW6m96p1mIxwgwES3T7zqXs9TylTbWF5UwC3v\nUySdYb/fGphmrF2tSo6CbOJYAPWs92Hrri5FgaN9dJ0iAhrvzispccKgQQKBgQC4\nKzxZA85UvfsqsNzRnr9kctDVskVucF11ns/L+LcgqfB1P3zB2RJm9oYFEF72++ku\n3qG4oS0BL5m62KutJYR8svxJdIpdZ8obob9jZsnP77bCcS7zWvgHDmS4WY1Oo/1d\nzHsSyQCGdq4WvzkzBsLxbEgpQ5jDTDk77pDrOepDrwKBgDAYj8lwI6vMX46w6NIm\nbIYLX5VMouygut5Flcw3JY9uvnbIJdt+vWpTGwkRoSs/ngtk2roiyHIOtmtuksfn\nZs79vgS6mTiHK7WadaG2QmBNeUwuoqQmjG2bJQYSXlHnkyWabreoRKuCCpp1xib6\n4505yEqJA+Ag5oAoMGqTYGVC\n-----END PRIVATE KEY-----\n
```

## How to Add These to Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project: **PortfolioLens**
3. Navigate to **Edge Functions** in the left sidebar
4. Find and click on **sync-google-drive**
5. Click on **Secrets** or **Environment Variables**
6. Add both secrets exactly as shown above

## Important Notes

- Copy the entire private key INCLUDING all the `\n` characters
- Do NOT convert `\n` to actual line breaks
- Make sure there are no extra spaces before or after either value

## Next Steps

After adding these credentials:

1. **Share your Google Drive folders** with this email:
   `portfoliolens-drive-sync@greenway-452013.iam.gserviceaccount.com`
   
2. **Test the connection** by going to `/import/google-drive-config` and clicking "Browse" on any folder

## Security Note

This file contains sensitive credentials. Delete it after you've configured Supabase.