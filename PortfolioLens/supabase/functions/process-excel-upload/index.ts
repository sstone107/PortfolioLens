import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.19.3/package/xlsx.mjs'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

// Initialize Supabase admin client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
})

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle health check
  const url = new URL(req.url)
  if (url.pathname.includes('/health')) {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'process-excel-upload' }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }

  try {
    const body = await req.json()
    const { jobId } = body
    
    if (!jobId) {
      throw new Error('Missing required parameter: jobId')
    }
    
    console.log(`Processing Excel file for job ${jobId}`)
    
    // Get job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    
    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message}`)
    }
    
    // Update job status to processing
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
    
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('imports')
      .download(job.bucket_path)
    
    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`)
    }
    
    // Convert blob to array buffer
    const arrayBuffer = await fileData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // Parse Excel file
    const workbook = XLSX.read(uint8Array, { type: 'array' })
    console.log(`Found ${workbook.SheetNames.length} sheets in Excel file`)
    
    // Get template mappings if template_id exists
    let templateMappings = null
    if (job.template_id) {
      const { data: template } = await supabaseAdmin
        .from('mapping_templates')
        .select('sheet_mappings')
        .eq('id', job.template_id)
        .single()
      
      if (template?.sheet_mappings) {
        templateMappings = template.sheet_mappings
      }
    }
    
    // Process each sheet
    let totalProcessed = 0
    let totalFailed = 0
    const sheetStatuses = []
    
    for (const sheetName of workbook.SheetNames) {
      console.log(`Processing sheet: ${sheetName}`)
      
      // Check if sheet should be skipped based on template
      let shouldSkip = false
      let targetTable = `ln_${sheetName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      let columnMappings = []
      
      if (templateMappings?.sheets) {
        const sheetMapping = templateMappings.sheets.find(
          (s: any) => s.originalName === sheetName
        )
        
        if (sheetMapping) {
          shouldSkip = sheetMapping.skip === true
          if (sheetMapping.mappedName) {
            targetTable = sheetMapping.mappedName.startsWith('ln_') 
              ? sheetMapping.mappedName 
              : `ln_${sheetMapping.mappedName}`
          }
          columnMappings = sheetMapping.columns || []
        }
      }
      
      // Create sheet status record
      await supabaseAdmin
        .from('import_sheet_status')
        .insert({
          job_id: jobId,
          sheet_name: sheetName,
          original_name: sheetName,
          status: shouldSkip ? 'skipped' : 'pending',
          total_rows: 0,
          target_table: targetTable
        })
      
      if (shouldSkip) {
        console.log(`Skipping sheet ${sheetName} as per template`)
        continue
      }
      
      // Convert sheet to JSON
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        blankrows: false
      }) as unknown[][]
      
      if (jsonData.length === 0) {
        console.log(`Sheet ${sheetName} is empty`)
        await supabaseAdmin
          .from('import_sheet_status')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            error_message: 'Sheet is empty'
          })
          .eq('job_id', jobId)
          .eq('sheet_name', sheetName)
        continue
      }
      
      // Get headers and data
      const headers = jsonData[0] as string[]
      const dataRows = jsonData.slice(1)
      
      console.log(`Sheet ${sheetName}: ${headers.length} columns, ${dataRows.length} rows`)
      
      // Update total rows
      await supabaseAdmin
        .from('import_sheet_status')
        .update({
          total_rows: dataRows.length,
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('job_id', jobId)
        .eq('sheet_name', sheetName)
      
      // Convert rows to objects
      const rowObjects = dataRows.map(row => {
        const obj: any = {}
        headers.forEach((header, index) => {
          if (header && row[index] !== undefined) {
            obj[header] = row[index]
          }
        })
        return obj
      })
      
      // Process in chunks
      const chunkSize = 1000
      for (let i = 0; i < rowObjects.length; i += chunkSize) {
        const chunk = rowObjects.slice(i, Math.min(i + chunkSize, rowObjects.length))
        const chunkIndex = Math.floor(i / chunkSize)
        
        // Store chunk in database
        await supabaseAdmin.rpc('receive_import_chunk', {
          p_job_id: jobId,
          p_sheet_name: sheetName,
          p_chunk_index: chunkIndex,
          p_total_chunks: Math.ceil(rowObjects.length / chunkSize),
          p_data: chunk,
          p_row_count: chunk.length
        })
      }
      
      // Trigger processing for this sheet
      const { data: processResponse, error: processError } = await supabaseAdmin.functions.invoke(
        'process-import-sheet',
        {
          body: { 
            jobId: jobId,
            sheetName: sheetName
          }
        }
      )
      
      if (processError) {
        console.error(`Error processing sheet ${sheetName}:`, processError)
        totalFailed += dataRows.length
      } else {
        const result = processResponse || {}
        totalProcessed += result.processed || 0
        totalFailed += result.failed || 0
      }
      
      sheetStatuses.push({
        sheet: sheetName,
        processed: processResponse?.processed || 0,
        failed: processResponse?.failed || 0,
        error: processError?.message
      })
    }
    
    // Update job completion status
    const finalStatus = totalFailed === 0 ? 'completed' : 
                       totalProcessed === 0 ? 'error' : 'completed'
    
    await supabaseAdmin
      .from('import_jobs')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        percent_complete: 100,
        row_counts: {
          processed: totalProcessed,
          failed: totalFailed,
          bySheet: sheetStatuses.reduce((acc, s) => ({
            ...acc,
            [s.sheet]: {
              processed: s.processed,
              failed: s.failed
            }
          }), {})
        },
        error_message: totalFailed > 0 
          ? `Processed ${totalProcessed} rows, ${totalFailed} failed`
          : null
      })
      .eq('id', jobId)
    
    // Log completion
    await supabaseAdmin
      .from('import_logs')
      .insert({
        job_id: jobId,
        level: finalStatus === 'completed' ? 'success' : 'warning',
        message: `Import completed: ${totalProcessed} rows processed, ${totalFailed} failed across ${workbook.SheetNames.length} sheets`,
        details: { sheetStatuses }
      })
    
    return new Response(
      JSON.stringify({ 
        success: true,
        processed: totalProcessed,
        failed: totalFailed,
        sheets: sheetStatuses
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
    
  } catch (error) {
    console.error('Excel processing error:', error)
    
    // Try to update job status
    if (body?.jobId) {
      await supabaseAdmin
        .from('import_jobs')
        .update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('id', body.jobId)
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})