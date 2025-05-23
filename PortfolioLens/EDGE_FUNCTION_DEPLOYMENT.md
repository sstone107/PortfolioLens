# Edge Function Deployment Guide - Server-Side Excel Processing

This guide covers deploying the new Edge Function for server-side Excel processing.

## Overview

We've implemented a new Edge Function `process-excel-upload` that handles Excel file processing entirely on the server side. This replaces the previous client-side parsing approach.

## Edge Functions to Deploy

### 1. process-excel-upload (NEW)
- **Location**: `/supabase/functions/process-excel-upload/index.ts`
- **Purpose**: Downloads Excel files from storage and processes them server-side
- **Features**:
  - Downloads file from Supabase Storage
  - Parses Excel using SheetJS
  - Processes each sheet according to template mappings
  - Triggers existing `process-import-sheet` function for data insertion

### 2. process-import-sheet (EXISTING - Already Deployed)
- **Location**: `/supabase/functions/process-import-sheet/index.ts`
- **Purpose**: Processes individual sheets and inserts data into tables
- **Status**: Already deployed and working

## Deployment Steps

### Prerequisites
1. Install Supabase CLI if not already installed:
```bash
npm install -g supabase
```

2. Link to your project:
```bash
supabase link --project-ref kukfbbaevndujnodafnk
```

### Deploy the New Edge Function

1. Navigate to the project directory:
```bash
cd /path/to/PortfolioLens
```

2. Deploy the new function:
```bash
supabase functions deploy process-excel-upload --no-verify-jwt
```

### Alternative: Deploy via Dashboard

1. Go to your Supabase Dashboard
2. Navigate to Edge Functions
3. Click "New Function"
4. Name: `process-excel-upload`
5. Copy the contents of `/supabase/functions/process-excel-upload/index.ts`
6. Click "Deploy"

## Testing the Server-Side Import

1. Navigate to `/import/batch`
2. Upload an Excel file
3. Complete the mapping steps as usual
4. Click "Execute Import"
5. You should be redirected to `/import/status/{jobId}`
6. The file will be:
   - Uploaded to Supabase Storage
   - Processed entirely on the server
   - Status updates shown in real-time

## Monitoring

Check Edge Function logs:
```bash
supabase functions logs process-excel-upload
```

Or in the dashboard:
1. Go to Edge Functions
2. Click on `process-excel-upload`
3. View "Logs" tab

## Key Changes from Previous Implementation

1. **File Upload First**: Files are now uploaded to Supabase Storage before processing
2. **Server-Side Parsing**: Excel parsing happens in the Edge Function, not the browser
3. **User Attribution**: Import jobs now show who uploaded the file
4. **Better Error Handling**: Server-side processing provides more robust error handling
5. **Scalability**: Can handle larger files without browser memory constraints

## Storage Configuration

The system uses the existing `imports` bucket:
- **Bucket**: `imports`
- **Path Format**: `{user_id}/{job_id}/{filename}`
- **Access**: Private (requires signed URLs)

## Benefits

1. **Performance**: No client-side memory constraints
2. **Security**: Files processed in secure server environment
3. **Reliability**: Server-side processing is more stable
4. **User Experience**: Immediate redirect to status page
5. **Attribution**: Track who uploaded each file

## Troubleshooting

### Function Not Found Error
If you get a "function not found" error:
1. Ensure the function is deployed: `supabase functions list`
2. Check the function name matches exactly: `process-excel-upload`

### Excel Parsing Errors
The Edge Function uses SheetJS from CDN. If parsing fails:
1. Check Edge Function logs for specific errors
2. Ensure the Excel file is valid
3. Verify template mappings are correct

### Storage Access Errors
If file upload/download fails:
1. Ensure the `imports` bucket exists
2. Check RLS policies on the bucket
3. Verify user authentication

## Rollback Plan

If issues arise, you can revert to client-side processing:
1. In `ReviewImportStep.tsx`, change:
   ```typescript
   import { useServerSideImport } from '../hooks/useServerSideImport';
   ```
   back to:
   ```typescript
   import { useBackgroundImport } from '../hooks/useBackgroundImport';
   ```
2. Update the function call accordingly

## Production Checklist

- [ ] Deploy `process-excel-upload` Edge Function
- [ ] Test with small Excel file
- [ ] Test with large Excel file (>10MB)
- [ ] Verify user attribution shows correctly
- [ ] Confirm file downloads work
- [ ] Monitor Edge Function logs for errors
- [ ] Update any documentation