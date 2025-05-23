import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JWT } from 'https://esm.sh/google-auth-library@8'

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
  parents?: string[]
}

interface SyncConfig {
  id: string
  folder_id: string
  folder_name: string
  template_id: string
  template_name: string
  file_pattern: string | null
  template_file_pattern: string | null
  last_sync_at: string | null
  include_subfolders: boolean
}

// Initialize Google Auth with service account
async function getGoogleAuth() {
  // Service account credentials should be stored as environment variables
  const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google service account credentials not configured')
  }

  // Replace escaped newlines in private key
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')

  const auth = new JWT({
    email: serviceAccountEmail,
    key: formattedPrivateKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  return auth
}

// Recursive function to get all files in folder and subfolders
async function getAllFilesInFolder(
  folderId: string, 
  accessToken: string, 
  path: string = '',
  allFiles: GoogleDriveFile[] = []
): Promise<GoogleDriveFile[]> {
  // First, get all files in this folder
  const filesUrl = `https://www.googleapis.com/drive/v3/files?` + 
    `q='${folderId}'+in+parents+and+` +
    `(mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'+or+` +
    `mimeType='text/csv'+or+` +
    `mimeType='application/vnd.ms-excel')&` +
    `fields=files(id,name,mimeType,modifiedTime,size,parents)&` +
    `orderBy=modifiedTime desc`
  
  const filesResponse = await fetch(filesUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  })
  
  if (!filesResponse.ok) {
    throw new Error(`Failed to list files in folder ${folderId}: ${filesResponse.statusText}`)
  }

  const filesData = await filesResponse.json()
  
  if (filesData.files) {
    // Add path information to files
    filesData.files.forEach((file: GoogleDriveFile) => {
      // Store the path in the name for pattern matching
      if (path) {
        file.name = `${path}/${file.name}`
      }
    })
    allFiles.push(...filesData.files)
  }

  // Then, get all subfolders
  const foldersUrl = `https://www.googleapis.com/drive/v3/files?` + 
    `q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'&` +
    `fields=files(id,name)`
  
  const foldersResponse = await fetch(foldersUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  })
  
  if (foldersResponse.ok) {
    const foldersData = await foldersResponse.json()
    
    // Recursively get files from each subfolder
    if (foldersData.files) {
      for (const folder of foldersData.files) {
        const subPath = path ? `${path}/${folder.name}` : folder.name
        await getAllFilesInFolder(folder.id, accessToken, subPath, allFiles)
      }
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
    const { configId, testMode = false } = await req.json()

    // Initialize Google Auth
    const auth = await getGoogleAuth()
    const accessToken = await auth.getAccessToken()
    
    if (!accessToken) {
      throw new Error('Failed to obtain Google access token')
    }

    // Get active sync configurations with template file patterns
    let configs: SyncConfig[] = []
    
    const configQuery = `
      SELECT 
        sc.id,
        sc.folder_id,
        sc.folder_name,
        sc.template_id,
        mt."templateName" as template_name,
        sc.file_pattern,
        mt.file_pattern as template_file_pattern,
        sc.last_sync_at,
        COALESCE(sc.include_subfolders, false) as include_subfolders
      FROM google_drive_sync_config sc
      LEFT JOIN mapping_templates mt ON mt."templateId" = sc.template_id
      WHERE sc.enabled = true
    `
    
    if (configId) {
      const { data, error } = await supabase
        .rpc('exec_sql', { sql: configQuery + ` AND sc.id = '${configId}'` })
      
      if (error) throw error
      configs = data || []
    } else {
      const { data, error } = await supabase
        .rpc('exec_sql', { sql: configQuery })
      
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
        // Get all files (including subfolders if enabled)
        let allFiles: GoogleDriveFile[]
        
        if (config.include_subfolders) {
          console.log('Including subfolders in search...')
          allFiles = await getAllFilesInFolder(config.folder_id, accessToken)
        } else {
          // Just get files in the specified folder
          const filesUrl = `https://www.googleapis.com/drive/v3/files?` + 
            `q='${config.folder_id}'+in+parents+and+` +
            `(mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'+or+` +
            `mimeType='text/csv'+or+` +
            `mimeType='application/vnd.ms-excel')&` +
            `fields=files(id,name,mimeType,modifiedTime,size)&` +
            `orderBy=modifiedTime desc`
          
          const filesResponse = await fetch(filesUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            }
          })
          
          if (!filesResponse.ok) {
            throw new Error(`Failed to list files: ${filesResponse.statusText}`)
          }

          const filesData = await filesResponse.json()
          allFiles = filesData.files || []
        }

        console.log(`Found ${allFiles.length} total files`)

        // Use pattern from config or template
        const filePattern = config.file_pattern || config.template_file_pattern
        
        // Filter files by pattern if specified
        let filesToProcess = allFiles
        if (filePattern) {
          const pattern = new RegExp(filePattern, 'i')
          filesToProcess = allFiles.filter((f: GoogleDriveFile) => 
            pattern.test(f.name)
          )
          console.log(`${filesToProcess.length} files match pattern: ${filePattern}`)
          
          // In test mode, just return the matching files
          if (testMode) {
            allResults.push({
              config: config.folder_name || config.folder_id,
              template: config.template_name,
              pattern: filePattern,
              totalFiles: allFiles.length,
              matchingFiles: filesToProcess.map(f => ({
                name: f.name,
                modifiedTime: f.modifiedTime,
                size: f.size
              }))
            })
            continue
          }
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

        // Process each new file (same as before)
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
                upsert: false
              })

            if (uploadError && !uploadError.message.includes('already exists')) {
              throw uploadError
            }

            // Create import job with template
            const { data: job, error: jobError } = await supabase
              .from('import_jobs')
              .insert({
                filename: file.name.split('/').pop(), // Get just the filename without path
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
                  file_path: file.name, // Full path including subfolders
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
              'process-excel-upload',
              {
                body: { 
                  jobId: job.id,
                  templateId: config.template_id
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})