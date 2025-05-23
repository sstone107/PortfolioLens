import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size: string
}

interface SyncConfig {
  id: string
  folder_id: string
  folder_name: string
  template_id: string
  template_name: string
  file_pattern: string | null
  enabled: boolean
  include_subfolders: boolean
  max_depth: number
  last_sync_at: string | null
}

// Create JWT for Google Service Account
async function getGoogleAccessToken() {
  const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  
  console.log('Service account email:', serviceAccountEmail ? 'configured' : 'missing')
  console.log('Private key:', privateKey ? 'configured' : 'missing')
  
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google service account credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variables.')
  }

  // Parse the private key - handle both single and double escaped newlines
  // Supabase sometimes double-escapes: \\n becomes \\\\n
  let formattedPrivateKey = privateKey
  
  // First, replace double-escaped newlines if present
  if (privateKey.includes('\\\\n')) {
    console.log('Detected double-escaped newlines, converting...')
    formattedPrivateKey = privateKey.replace(/\\\\n/g, '\n')
  } else if (privateKey.includes('\\n')) {
    console.log('Detected single-escaped newlines, converting...')
    formattedPrivateKey = privateKey.replace(/\\n/g, '\n')
  }
  
  // Import the private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"
  
  console.log('Checking key format...')
  console.log('Has header:', formattedPrivateKey.includes(pemHeader))
  console.log('Has footer:', formattedPrivateKey.includes(pemFooter))
  console.log('Key preview:', formattedPrivateKey.substring(0, 100))
  
  const headerIndex = formattedPrivateKey.indexOf(pemHeader)
  const footerIndex = formattedPrivateKey.lastIndexOf(pemFooter)
  
  if (headerIndex === -1 || footerIndex === -1) {
    throw new Error('Private key missing BEGIN/END markers after formatting')
  }
  
  const pemContents = formattedPrivateKey.substring(
    headerIndex + pemHeader.length,
    footerIndex
  ).trim()
  
  console.log('PEM content length:', pemContents.replace(/\s/g, '').length)
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  )

  // Create JWT - use proper numeric dates without getNumericDate wrapper
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, // 1 hour from now
    iat: now,
  }

  const jwt = await create({ alg: "RS256", typ: "JWT" }, payload, key)

  // Exchange JWT for access token
  console.log('Exchanging JWT for access token...')
  console.log('Using email:', serviceAccountEmail)
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    console.error('Token exchange failed:', tokenResponse.status, error)
    throw new Error(`Failed to get access token: ${error}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// Recursive function to search files in folder and subfolders
async function searchFilesRecursively(
  accessToken: string, 
  folderId: string, 
  pattern: RegExp | null,
  modifiedAfter: Date | null = null,
  depth: number = 0,
  maxDepth: number = 5
): Promise<GoogleDriveFile[]> {
  if (depth > maxDepth) {
    console.log(`Max depth ${maxDepth} reached, skipping deeper folders`)
    return []
  }
  
  const allFiles: GoogleDriveFile[] = []
  
  // Get files in current folder - add date filter to the query
  let query = `'${folderId}' in parents and (`
  query += `mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or `
  query += `mimeType='text/csv' or `
  query += `mimeType='application/vnd.ms-excel')`
  
  // Add date filter directly to the Drive API query
  if (modifiedAfter) {
    const dateStr = modifiedAfter.toISOString()
    query += ` and modifiedTime > '${dateStr}'`
  }
  
  const filesUrl = `https://www.googleapis.com/drive/v3/files?` + 
    `q=${encodeURIComponent(query)}&` +
    `fields=files(id,name,mimeType,modifiedTime,size)&` +
    `pageSize=1000&` +
    `orderBy=modifiedTime desc`
  
  const filesResponse = await fetch(filesUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
  
  if (filesResponse.ok) {
    const filesData = await filesResponse.json()
    const files = filesData.files || []
    
    // Filter by pattern if provided (date filtering already done in API query)
    const matchingFiles = pattern 
      ? files.filter((f: GoogleDriveFile) => pattern.test(f.name))
      : files
    
    allFiles.push(...matchingFiles)
    console.log(`Found ${matchingFiles.length} matching files in folder at depth ${depth}`)
  }
  
  // Get subfolders
  const foldersUrl = `https://www.googleapis.com/drive/v3/files?` + 
    `q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'&` +
    `fields=files(id,name)&` +
    `pageSize=100`
  
  const foldersResponse = await fetch(foldersUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
  
  if (foldersResponse.ok) {
    const foldersData = await foldersResponse.json()
    const folders = foldersData.files || []
    
    console.log(`Found ${folders.length} subfolders at depth ${depth}`)
    
    // Recursively search each subfolder
    for (const folder of folders) {
      console.log(`Searching subfolder: ${folder.name}`)
      const subfolderFiles = await searchFilesRecursively(
        accessToken, 
        folder.id, 
        pattern,
        modifiedAfter,
        depth + 1, 
        maxDepth
      )
      allFiles.push(...subfolderFiles)
    }
  }
  
  return allFiles
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get request parameters
    const { configId, testMode = false, browseFolderId, debugMode = false, testEnv = false, testKeyFormat = false, email: testEmail, privateKey: testPrivateKey, hoursBack = 24, maxDepth } = await req.json()
    
    // Test raw environment variables
    if (testEnv) {
      const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') || ''
      const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') || ''
      
      // Check different possible issues
      const checks = {
        email: {
          raw: email,
          trimmed: email.trim(),
          length: email.length,
          trimmedLength: email.trim().length,
          startsWithSpace: email.startsWith(' '),
          endsWithSpace: email.endsWith(' '),
          hasQuotes: email.includes('"') || email.includes("'")
        },
        privateKey: {
          length: privateKey.length,
          startsWithSpace: privateKey.startsWith(' '),
          endsWithSpace: privateKey.endsWith(' '),
          hasDoubleBackslash: privateKey.includes('\\\\'),
          hasSingleBackslash: privateKey.includes('\\n'),
          hasRealNewline: privateKey.includes('\n'),
          firstChars: privateKey.substring(0, 30),
          lastChars: privateKey.substring(privateKey.length - 30),
          hasQuotes: privateKey.includes('"') || privateKey.includes("'")
        }
      }
      
      return new Response(
        JSON.stringify(checks, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Test key format directly
    if (testKeyFormat && testEmail && testPrivateKey) {
      try {
        // Test the JWT creation with the provided credentials
        const jwt = await create(
          { alg: "RS256", typ: "JWT" },
          {
            iss: testEmail,
            scope: "https://www.googleapis.com/auth/drive.readonly",
            aud: "https://oauth2.googleapis.com/token",
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
          },
          await (async () => {
            // Process the key
            const formattedKey = testPrivateKey.replace(/\\n/g, '\n')
            const pemHeader = "-----BEGIN PRIVATE KEY-----"
            const pemFooter = "-----END PRIVATE KEY-----"
            const pemContents = formattedKey.substring(
              formattedKey.indexOf(pemHeader) + pemHeader.length,
              formattedKey.lastIndexOf(pemFooter)
            ).trim()
            
            const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
            
            return crypto.subtle.importKey(
              "pkcs8",
              binaryKey,
              {
                name: "RSASSA-PKCS1-v1_5",
                hash: "SHA-256",
              },
              false,
              ["sign"]
            )
          })()
        )
        
        // Try to exchange for token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
          }),
        })
        
        const tokenData = await tokenResponse.json()
        
        return new Response(
          JSON.stringify({
            success: tokenResponse.ok,
            status: tokenResponse.status,
            response: tokenData
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            error: err.message,
            stack: err.stack
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
    
    // Debug mode - return environment info
    if (debugMode) {
      const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
      
      return new Response(
        JSON.stringify({
          email: {
            present: !!email,
            value: email ? email.substring(0, 30) + '...' : 'NOT SET'
          },
          privateKey: {
            present: !!privateKey,
            length: privateKey?.length || 0,
            hasEscapedNewlines: privateKey?.includes('\\n') || false,
            sample: privateKey ? privateKey.substring(0, 100) + '...' : 'NOT SET'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Google access token
    console.log('Attempting to get Google access token...')
    const accessToken = await getGoogleAccessToken()
    console.log('Successfully obtained Google access token')

    // Handle browse mode - just list folder contents
    if (browseFolderId) {
      console.log(`Browsing folder: ${browseFolderId}`)
      
      // Get files
      const filesUrl = `https://www.googleapis.com/drive/v3/files?` + 
        `q='${browseFolderId}'+in+parents+and+` +
        `(mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'+or+` +
        `mimeType='text/csv'+or+` +
        `mimeType='application/vnd.ms-excel')&` +
        `fields=files(id,name,mimeType,modifiedTime,size)&` +
        `pageSize=100&` +
        `orderBy=name`
      
      const filesResponse = await fetch(filesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      })

      if (!filesResponse.ok) {
        const errorText = await filesResponse.text()
        console.error(`Failed to list files: ${filesResponse.status} - ${errorText}`)
        throw new Error(`Failed to list files: ${filesResponse.statusText}`)
      }

      const filesData = await filesResponse.json()

      // Get folders
      const foldersUrl = `https://www.googleapis.com/drive/v3/files?` + 
        `q='${browseFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'&` +
        `fields=files(id,name)&` +
        `pageSize=100&` +
        `orderBy=name`
      
      const foldersResponse = await fetch(foldersUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      })

      const foldersData = foldersResponse.ok ? await foldersResponse.json() : { files: [] }

      return new Response(
        JSON.stringify({
          success: true,
          currentFolderId: browseFolderId,
          files: filesData.files || [],
          folders: foldersData.files || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get active sync configurations
    let configs: SyncConfig[] = []
    
    if (configId) {
      // Sync specific configuration
      const { data, error } = await supabase
        .rpc('get_active_sync_configs')
        .eq('id', configId)
      
      if (error) throw error
      configs = data || []
    } else {
      // Sync all active configurations
      const { data, error } = await supabase
        .rpc('get_active_sync_configs')
      
      if (error) throw error
      configs = data || []
    }

    if (configs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active sync configurations found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${configs.length} sync configurations`)
    const allResults = []

    // Process each sync configuration
    for (const config of configs) {
      console.log(`Syncing folder: ${config.folder_name || config.folder_id}`)
      
      try {
        // List files in the Google Drive folder using OAuth
        // Add date filter directly to the API query for efficiency
        const cutoffDate = new Date()
        cutoffDate.setHours(cutoffDate.getHours() - hoursBack)
        
        let query = `'${config.folder_id}' in parents and (`
        query += `mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or `
        query += `mimeType='text/csv' or `
        query += `mimeType='application/vnd.ms-excel')`
        query += ` and modifiedTime > '${cutoffDate.toISOString()}'`
        
        const filesUrl = `https://www.googleapis.com/drive/v3/files?` + 
          `q=${encodeURIComponent(query)}&` +
          `fields=files(id,name,mimeType,modifiedTime,size)&` +
          `pageSize=100&` +
          `orderBy=modifiedTime desc`
        
        const filesResponse = await fetch(filesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        })
        
        if (!filesResponse.ok) {
          const errorText = await filesResponse.text()
          console.error(`Failed to list files: ${filesResponse.status} - ${errorText}`)
          
          // Check if it's a permissions error
          if (filesResponse.status === 403) {
            throw new Error(`No access to folder ${config.folder_id}. Ensure the service account has been granted access.`)
          }
          throw new Error(`Failed to list files: ${filesResponse.statusText}`)
        }

        const filesData = await filesResponse.json()
        
        if (!filesData.files) {
          console.error(`No files found in folder ${config.folder_id}`)
          continue
        }

        console.log(`Found ${filesData.files.length} files in folder`)

        // Get files based on include_subfolders setting
        let allFiles: GoogleDriveFile[] = []
        
        if (config.include_subfolders) {
          console.log('Searching recursively including subfolders...')
          // Convert glob pattern to regex
          const regexPattern = config.file_pattern 
            ? config.file_pattern
                .replace(/\./g, '\\.')  // Escape dots
                .replace(/\*/g, '.*')   // Convert * to .*
                .replace(/\?/g, '.')    // Convert ? to .
            : null
          const pattern = regexPattern ? new RegExp(regexPattern, 'i') : null
          console.log(`Using pattern: ${regexPattern}`)
          
          // Only get files modified in the specified time window
          const cutoffDate = new Date()
          cutoffDate.setHours(cutoffDate.getHours() - hoursBack)
          console.log(`Only including files modified after: ${cutoffDate.toISOString()} (last ${hoursBack} hours)`)
          
          // Use max_depth from config, default to 1 if not set
          const maxDepth = config.max_depth || 1
          console.log(`Searching up to ${maxDepth} levels deep`)
          
          allFiles = await searchFilesRecursively(accessToken, config.folder_id, pattern, cutoffDate, 0, maxDepth)
          console.log(`Found ${allFiles.length} total matching files modified in last ${hoursBack} hours (including subfolders up to depth ${maxDepth})`)
        } else {
          // Just get files from the current folder
          allFiles = filesData.files || []
          
          // Filter by specified time window
          const cutoffDate = new Date()
          cutoffDate.setHours(cutoffDate.getHours() - hoursBack)
          allFiles = allFiles.filter((f: GoogleDriveFile) => {
            const fileDate = new Date(f.modifiedTime)
            return fileDate > cutoffDate
          })
          
          // Filter files by pattern if specified
          if (config.file_pattern) {
            // Convert glob pattern to regex
            const regexPattern = config.file_pattern
              .replace(/\./g, '\\.')  // Escape dots
              .replace(/\*/g, '.*')   // Convert * to .*
              .replace(/\?/g, '.')    // Convert ? to .
            const pattern = new RegExp(regexPattern, 'i')
            allFiles = allFiles.filter((f: GoogleDriveFile) => pattern.test(f.name))
            console.log(`${allFiles.length} files match pattern and are from last 24 hours: ${config.file_pattern} (regex: ${regexPattern})`)
          } else {
            console.log(`${allFiles.length} files from last 24 hours`)
          }
        }
        
        const filesToProcess = allFiles

        // In test mode, just return the matching files
        if (testMode) {
          allResults.push({
            config: config.folder_name || config.folder_id,
            template: config.template_name,
            pattern: config.file_pattern,
            totalFiles: filesData.files.length,
            matchingFiles: filesToProcess.map((f: GoogleDriveFile) => ({
              name: f.name,
              modifiedTime: f.modifiedTime,
              size: f.size
            }))
          })
          continue
        }

        // Check which files have already been processed
        const { data: processedFiles } = await supabase
          .from('google_drive_sync_history')
          .select('file_id')
          .eq('config_id', config.id)

        const processedFileIds = new Set(processedFiles?.map(f => f.file_id) || [])
        const newFiles = filesToProcess.filter((f: GoogleDriveFile) => 
          !processedFileIds.has(f.id)
        )

        console.log(`${newFiles.length} new files to process`)

        // Process each new file
        for (const file of newFiles) {
          try {
            console.log(`Downloading: ${file.name}`)
            
            // Download file content using OAuth
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
            const fileResponse = await fetch(downloadUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              }
            })
            
            if (!fileResponse.ok) {
              throw new Error(`Failed to download: ${fileResponse.statusText}`)
            }

            const fileBlob = await fileResponse.blob()
            const arrayBuffer = await fileBlob.arrayBuffer()
            const uint8Array = new Uint8Array(arrayBuffer)

            // Upload to Supabase Storage with organized path
            const timestamp = new Date().toISOString().split('T')[0]
            const storagePath = `google-drive-sync/${config.folder_name || config.folder_id}/${timestamp}/${file.name}`
            
            const { error: uploadError } = await supabase.storage
              .from('imports')
              .upload(storagePath, uint8Array, {
                contentType: file.mimeType,
                upsert: false // Don't overwrite existing files
              })

            if (uploadError && !uploadError.message.includes('already exists')) {
              throw uploadError
            }

            // Create import job with template
            const { data: job, error: jobError } = await supabase
              .from('import_jobs')
              .insert({
                filename: file.name,
                bucket_path: storagePath,
                status: 'pending',
                template_id: config.template_id,
                user_id: '00000000-0000-0000-0000-000000000000', // System user
                source_metadata: {
                  source: 'google_drive',
                  sync_config_id: config.id,
                  folder_id: config.folder_id,
                  folder_name: config.folder_name,
                  file_id: file.id,
                  file_modified_time: file.modifiedTime,
                  file_size: file.size,
                  auto_import: true
                }
              })
              .select()
              .single()

            if (jobError) {
              throw jobError
            }

            // Record in sync history
            await supabase
              .from('google_drive_sync_history')
              .insert({
                config_id: config.id,
                file_id: file.id,
                file_name: file.name,
                file_modified_time: file.modifiedTime,
                import_job_id: job.id
              })

            // Trigger the Excel processing Edge Function
            const { error: processError } = await supabase.functions.invoke(
              'process-import-sheet',
              {
                body: { 
                  jobId: job.id,
                  templateId: config.template_id // Pass template for automatic mapping
                }
              }
            )

            if (processError) {
              console.error(`Failed to trigger processing: ${processError.message}`)
              await supabase
                .from('import_jobs')
                .update({ 
                  status: 'error',
                  error_message: `Failed to trigger processing: ${processError.message}`
                })
                .eq('id', job.id)
            }

            allResults.push({
              config: config.folder_name || config.folder_id,
              template: config.template_name,
              filename: file.name,
              jobId: job.id,
              status: processError ? 'error' : 'processing',
              error: processError?.message
            })

          } catch (error) {
            console.error(`Error processing file ${file.name}:`, error)
            allResults.push({
              config: config.folder_name || config.folder_id,
              template: config.template_name,
              filename: file.name,
              status: 'error',
              error: error.message
            })
          }
        }

        // Update last sync time
        await supabase
          .from('google_drive_sync_config')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', config.id)

      } catch (error) {
        console.error(`Error syncing folder ${config.folder_id}:`, error)
        allResults.push({
          config: config.folder_name || config.folder_id,
          status: 'error',
          error: `Folder sync failed: ${error.message}`
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        configs: configs.length,
        results: allResults
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in sync-google-drive function:', error)
    
    // Provide more helpful error messages
    let errorMessage = error.message
    let statusCode = 400
    
    if (error.message.includes('account not found') || error.message.includes('invalid_grant')) {
      errorMessage = 'Google service account not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in Supabase Edge Functions secrets.'
      statusCode = 503 // Service Unavailable
    } else if (error.message.includes('credentials not configured')) {
      errorMessage = 'Google service account credentials missing. Please configure in Supabase Dashboard > Edge Functions > sync-google-drive > Secrets'
      statusCode = 503
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    )
  }
})