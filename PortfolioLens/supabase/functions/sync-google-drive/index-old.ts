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
}

interface SyncConfig {
  id: string
  folder_id: string
  folder_name: string
  template_id: string
  template_name: string
  file_pattern: string | null
  last_sync_at: string | null
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
    const { configId, testMode = false, browseFolderId } = await req.json()

    // Initialize Google Auth
    const auth = await getGoogleAuth()
    const accessToken = await auth.getAccessToken()
    
    if (!accessToken) {
      throw new Error('Failed to obtain Google access token')
    }

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
        `orderBy=name`
      
      const filesResponse = await fetch(filesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      })

      if (!filesResponse.ok) {
        throw new Error(`Failed to list files: ${filesResponse.statusText}`)
      }

      const filesData = await filesResponse.json()

      // Get folders
      const foldersUrl = `https://www.googleapis.com/drive/v3/files?` + 
        `q='${browseFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'&` +
        `fields=files(id,name)&` +
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

        // Filter files by pattern if specified
        let filesToProcess = filesData.files
        if (config.file_pattern) {
          const pattern = new RegExp(config.file_pattern, 'i')
          filesToProcess = filesData.files.filter((f: GoogleDriveFile) => 
            pattern.test(f.name)
          )
          console.log(`${filesToProcess.length} files match pattern: ${config.file_pattern}`)
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
              'process-excel-upload',
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})