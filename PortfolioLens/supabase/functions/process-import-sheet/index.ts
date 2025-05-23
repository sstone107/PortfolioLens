import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

// Initialize Supabase admin client once
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
})

// Safe column name
function safeColumnName(name: string): string {
  let safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 63)
  
  // If the name starts with a number, prefix it with 'n_'
  if (/^\d/.test(safeName)) {
    safeName = 'n_' + safeName
  }
  
  // Ensure it's not longer than 63 characters after prefix
  return safeName.substring(0, 63)
}

// Coerce value to type with enhanced handling
function coerceValue(value: any, type: string, columnName?: string): any {
  if (value === null || value === undefined || value === '') {
    return null
  }
  
  try {
    // Handle string preprocessing
    if (typeof value === 'string') {
      // Remove surrounding quotes if present
      value = value.replace(/^["']|["']$/g, '').trim()
    }
    
    switch (type.toLowerCase()) {
      case 'text':
      case 'varchar':
      case 'character varying':
        return String(value)
      
      case 'numeric':
      case 'integer':
      case 'bigint':
      case 'smallint':
      case 'decimal':
      case 'real':
      case 'double precision':
        // Handle currency/number formats
        if (typeof value === 'string') {
          // Remove currency symbols, commas, and spaces
          const cleanValue = value.replace(/[$,\s]/g, '')
          const num = Number(cleanValue)
          if (isNaN(num)) {
            console.warn(`Cannot parse "${value}" as number for column ${columnName || 'unknown'}`)
            return null
          }
          return num
        }
        const num = Number(value)
        return isNaN(num) ? null : num
      
      case 'boolean':
      case 'bool':
        if (typeof value === 'boolean') return value
        if (typeof value === 'string') {
          const lowered = value.toLowerCase()
          return lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'y'
        }
        return Boolean(value)
      
      case 'timestamp':
      case 'timestamptz':
      case 'timestamp with time zone':
      case 'timestamp without time zone':
        // Handle Excel date serial numbers
        if (typeof value === 'number' && value > 25569 && value < 100000) {
          // Excel date (days since 1900-01-01)
          const excelDate = new Date((value - 25569) * 86400 * 1000)
          return excelDate.toISOString()
        }
        const timestamp = new Date(value)
        return isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
      
      case 'date':
        // Handle Excel date serial numbers
        if (typeof value === 'number' && value > 25569 && value < 100000) {
          // Excel date (days since 1900-01-01)
          const excelDate = new Date((value - 25569) * 86400 * 1000)
          return excelDate.toISOString().split('T')[0]
        }
        const date = new Date(value)
        if (isNaN(date.getTime())) return null
        // For date columns, return only the date portion (YYYY-MM-DD)
        return date.toISOString().split('T')[0]
      
      case 'json':
      case 'jsonb':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value)
          } catch {
            return value
          }
        }
        return value
      
      default:
        return String(value)
    }
  } catch (error) {
    console.error(`Error coercing value to ${type} for column ${columnName || 'unknown'}:`, error)
    return null
  }
}

// Ensure table exists with columns
async function ensureTableAndColumns(
  tableName: string,
  columnMappings: Array<{ originalName: string; mappedName: string; dataType: string }>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if table exists using the proper function
    const { data: tableExists, error: checkError } = await supabaseAdmin.rpc('table_exists', {
      p_table_name: tableName
    })
    
    if (checkError) {
      console.error('Error checking table existence:', checkError)
      return { success: false, error: checkError.message }
    }
    
    if (!tableExists) {
      // Table doesn't exist, create it
      console.log(`Creating table ${tableName}`)
      const { data: createResult, error: createError } = await supabaseAdmin.rpc('create_import_table', {
        p_table_name: tableName
      })
      
      if (createError || !createResult?.success) {
        console.error('Failed to create table:', createError || createResult?.error)
        return { success: false, error: createError?.message || createResult?.error }
      }
      
      console.log(`Table ${tableName} created successfully`)
    } else {
      console.log(`Table ${tableName} already exists`)
    }
  } catch (error) {
    console.error('Unexpected error in table check:', error)
    return { success: false, error: error.message }
  }
  
  // Ensure import tracking columns exist
  const { data: trackingResult, error: trackingError } = await supabaseAdmin.rpc('ensure_import_tracking_columns', {
    p_table_name: tableName
  })
  
  if (trackingError) {
    console.error('Failed to ensure tracking columns:', trackingError)
  }
  
  // Prepare columns to add (excluding our tracking columns)
  const columnsToAdd = columnMappings
    .filter(cm => !['import_job_id', 'import_row_number'].includes(cm.mappedName))
    .map(cm => ({
      name: safeColumnName(cm.mappedName),
      type: cm.dataType || 'text'
    }))
  
  if (columnsToAdd.length > 0) {
    console.log(`Adding ${columnsToAdd.length} columns to ${tableName}`)
    const { data: columnsResult, error: columnsError } = await supabaseAdmin.rpc('add_import_columns_batch', {
      p_table_name: tableName,
      p_columns: columnsToAdd
    })
    
    if (columnsError) {
      console.error('Failed to add columns:', columnsError)
      return { success: false, error: columnsError.message }
    }
    
    if (columnsResult?.results) {
      const errors = columnsResult.results.filter((r: any) => !r.success)
      if (errors.length > 0) {
        console.error('Some columns failed to add:', errors)
      }
    }
    
    // Refresh schema cache after adding columns
    console.log('Refreshing schema cache...')
    const { error: refreshError } = await supabaseAdmin.rpc('refresh_schema_cache')
    if (refreshError) {
      console.warn('Failed to refresh schema cache:', refreshError)
    }
    
    // Add a small delay to allow schema cache to update
    // This is a workaround for PostgREST schema cache lag
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log('Schema cache refresh complete')
  }
  
  return { success: true }
}

// Process sheet data into table
async function processSheetData(
  jobId: string,
  sheetName: string,
  targetTable: string,
  columnMappings: Array<{ originalName: string; mappedName: string; dataType: string }>,
  rowsToInsert: any[]
): Promise<{ processed: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let processed = 0
  let failed = 0

  try {
    // Ensure table and columns exist
    const { success, error } = await ensureTableAndColumns(targetTable, columnMappings)
    if (!success) {
      errors.push(`Failed to prepare table: ${error}`)
      return { processed: 0, failed: rowsToInsert.length, errors }
    }
    
    // Process in smaller batches
    const batchSize = 25
    
    for (let i = 0; i < rowsToInsert.length; i += batchSize) {
      const batch = rowsToInsert.slice(i, Math.min(i + batchSize, rowsToInsert.length))
      const insertData = []
      const loanNumbersToResolve: { 
        index: number; 
        investorLoanNumber: string | null;
        sellerLoanNumber: string | null;
        currentServicerLoanNumber: string | null;
        genericLoanNumber: string | null;
      }[] = []
      
      // First pass: prepare data and identify loan numbers
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j]
        const insertRow: any = {
          import_job_id: jobId,
          import_row_number: i + j + 1
        }
        
        // Extract loan numbers from original data BEFORE mapping
        let investorLoanNumber = null
        let sellerLoanNumber = null
        let currentServicerLoanNumber = null
        let genericLoanNumber = null
        let valonLoanId = null
        let previousServicerLoanId = null
        let mersId = null
        
        // Look for loan numbers in the original row data
        for (const [key, value] of Object.entries(row)) {
          if (!value) continue
          
          const lowerKey = key.toLowerCase()
          if (lowerKey.includes('investor') && lowerKey.includes('loan')) {
            investorLoanNumber = String(value).trim()
          } else if (lowerKey.includes('seller') && lowerKey.includes('loan')) {
            sellerLoanNumber = String(value).trim()
          } else if (lowerKey.includes('current') && lowerKey.includes('servicer') && lowerKey.includes('loan')) {
            currentServicerLoanNumber = String(value).trim()
          } else if (lowerKey === 'valon_loan_id' || lowerKey === 'valonloanid') {
            valonLoanId = String(value).trim()
          } else if (lowerKey === 'previous_servicer_loan_id' || lowerKey === 'previousservicerloanid') {
            previousServicerLoanId = String(value).trim()
          } else if (lowerKey === 'mers_id' || lowerKey === 'mersid') {
            mersId = String(value).trim()
          } else if (lowerKey === 'loan_number' || lowerKey === 'loannumber') {
            genericLoanNumber = String(value).trim()
          }
        }
        
        // Log the first row to see what columns we have
        if (i === 0 && j === 0) {
          console.log(`\n=== Processing First Row of ${sheetName} ===`)
          console.log(`Row has ${Object.keys(row).length} columns`)
          console.log(`Sample column names:`, Object.keys(row).slice(0, 15))
          console.log(`\nLoan number extraction:`)
          console.log(`  Investor: ${investorLoanNumber}`)
          console.log(`  Seller: ${sellerLoanNumber}`)
          console.log(`  Current Servicer: ${currentServicerLoanNumber}`)
          console.log(`  Valon: ${valonLoanId}`)
          console.log(`  Previous Servicer: ${previousServicerLoanId}`)
          console.log(`  MERS: ${mersId}`)
          console.log(`  Generic: ${genericLoanNumber}`)
        }
        
        // Map columns based on template mappings
        for (const mapping of columnMappings) {
          const value = row[mapping.originalName]
          const columnName = safeColumnName(mapping.mappedName)
          insertRow[columnName] = coerceValue(value, mapping.dataType || 'text', columnName)
          
          // If the original mapped name started with a number and was transformed,
          // also check if there's a value under the original name
          if (mapping.mappedName !== columnName && !value && row[mapping.mappedName]) {
            insertRow[columnName] = coerceValue(row[mapping.mappedName], mapping.dataType || 'text', columnName)
          }
        }
        
        // Add default values for required fields based on table type
        if (targetTable === 'ln_insurance_advances') {
          insertRow.insurance_type = insertRow.insurance_type || 'Unknown'
        }
        if (targetTable === 'ln_loan_expenses') {
          insertRow.expense_date = insertRow.expense_date || new Date().toISOString().split('T')[0]
        }
        if (targetTable === 'ln_remittance_report') {
          insertRow.report_date = insertRow.report_date || new Date().toISOString().split('T')[0]
        }
        if (targetTable === 'ln_transactions') {
          insertRow.transaction_date = insertRow.transaction_date || new Date().toISOString().split('T')[0]
        }
        
        // For ln_loan_information, ensure loan_number is set
        if (targetTable === 'ln_loan_information' && !insertRow.loan_number) {
          // Use the prioritized loan number (investor first, then others)
          const loanNum = investorLoanNumber || valonLoanId || sellerLoanNumber || 
                          currentServicerLoanNumber || previousServicerLoanId || 
                          mersId || genericLoanNumber ||
                          // Also check the mapped data for loan_number
                          insertRow.investor_loan_number || insertRow.valon_loan_id ||
                          insertRow.seller_loan_number || insertRow.current_servicer_loan_number ||
                          insertRow.previous_servicer_loan_id || insertRow.mers_id
          
          if (loanNum) {
            insertRow.loan_number = String(loanNum).trim()
          } else {
            // Log warning but still try to insert - maybe loan_number is in the mapped columns
            console.warn(`Warning: No loan number found for row ${j + 1} in ln_loan_information. Row data:`, {
              investor: investorLoanNumber,
              valon: valonLoanId,
              seller: sellerLoanNumber,
              generic: genericLoanNumber,
              mappedColumns: Object.keys(insertRow)
            })
          }
        }
        
        insertData.push(insertRow)
        
        // Track loan numbers that need loan_id resolution
        // Skip ln_loan_information as it doesn't have a loan_id column
        if (targetTable.startsWith('ln_') && targetTable !== 'ln_loan_information' && !insertRow.loan_id) {
          if (investorLoanNumber || sellerLoanNumber || currentServicerLoanNumber || 
              genericLoanNumber || valonLoanId || previousServicerLoanId || mersId) {
            loanNumbersToResolve.push({ 
              index: insertData.length - 1, // Use actual index in insertData array
              investorLoanNumber,
              sellerLoanNumber,
              currentServicerLoanNumber,
              genericLoanNumber,
              valonLoanId,
              previousServicerLoanId,
              mersId
            })
          }
        }
        
        // For ln_loan_information, also set the loan_number field
        if (targetTable === 'ln_loan_information' && !insertRow.loan_number) {
          // Use the prioritized loan number (investor first, then valon)
          const loanNum = investorLoanNumber || valonLoanId || sellerLoanNumber || 
                          currentServicerLoanNumber || previousServicerLoanId || 
                          mersId || genericLoanNumber
          
          if (loanNum) {
            insertRow.loan_number = loanNum
          } else {
            // If no loan number found in standard fields, try to find it in the mapped data
            // Check common loan number field variations
            const loanNumberValue = originalRow['loan_number'] || originalRow['loan_id'] || 
                                   originalRow['account_number'] || originalRow['account_id'] ||
                                   originalRow['loan'] || originalRow['account'] ||
                                   insertRow.loan_number || insertRow.loan_id ||
                                   insertRow.account_number || insertRow.account_id
            
            if (loanNumberValue) {
              insertRow.loan_number = String(loanNumberValue)
            } else {
              // As a last resort, generate a unique identifier
              console.warn(`No loan number found for row ${j + 1}, skipping this row for ln_loan_information`)
              continue // Skip this row entirely
            }
          }
        }
      }
      
      // Second pass: resolve loan_ids in batch if needed
      if (loanNumbersToResolve.length > 0) {
        for (const { index, investorLoanNumber, sellerLoanNumber, currentServicerLoanNumber, 
                    genericLoanNumber, valonLoanId, previousServicerLoanId, mersId } of loanNumbersToResolve) {
          try {
            const { data: loanIdResult, error: loanIdError } = await supabaseAdmin.rpc('get_or_create_loan_id', {
              p_investor_loan_number: investorLoanNumber,
              p_seller_loan_number: sellerLoanNumber,
              p_current_servicer_loan_number: currentServicerLoanNumber,
              p_loan_number: genericLoanNumber,
              p_valon_loan_id: valonLoanId,
              p_previous_servicer_loan_id: previousServicerLoanId,
              p_mers_id: mersId
            })
            
            if (!loanIdError && loanIdResult) {
              insertData[index].loan_id = loanIdResult
            } else if (loanIdError) {
              console.error(`Failed to generate loan_id:`, loanIdError)
            }
          } catch (e) {
            console.error(`Failed to generate loan_id:`, e)
          }
        }
      }
      
      try {
        // For ln_loan_information, use upsert to handle duplicates
        if (targetTable === 'ln_loan_information') {
          // Insert with conflict handling
          const { error: insertError } = await supabaseAdmin
            .from(targetTable)
            .upsert(insertData, {
              onConflict: 'loan_number',
              ignoreDuplicates: false // Update existing records
            })
          
          if (insertError) {
            // Check if it's a duplicate error we can handle differently
            if (insertError.code === '23505') {
              // Try to update existing records one by one
              let successCount = 0
              for (const row of insertData) {
                try {
                  const { error: updateError } = await supabaseAdmin
                    .from(targetTable)
                    .update(row)
                    .eq('loan_number', row.loan_number)
                  
                  if (!updateError) {
                    successCount++
                  } else {
                    console.error(`Failed to update loan ${row.loan_number}:`, updateError)
                  }
                } catch (e) {
                  console.error(`Error updating loan ${row.loan_number}:`, e)
                }
              }
              processed += successCount
              failed += insertData.length - successCount
              if (successCount < insertData.length) {
                errors.push(`Batch ${i + 1}-${i + batch.length}: Updated ${successCount} of ${insertData.length} existing loans`)
              }
            } else {
              failed += batch.length
              errors.push(`Batch ${i + 1}-${i + batch.length}: ${insertError.message}`)
              console.error(`Insert error for ${targetTable}:`, insertError)
            }
          } else {
            processed += batch.length
          }
        } else {
          // For other tables, use regular insert
          const { error: insertError } = await supabaseAdmin
            .from(targetTable)
            .insert(insertData)
          
          if (insertError) {
            failed += batch.length
            const errorMsg = insertError.message || insertError.details || JSON.stringify(insertError)
            errors.push(`Batch ${i + 1}-${i + batch.length}: ${errorMsg}`)
            console.error(`Insert error for ${targetTable}:`, JSON.stringify(insertError, null, 2))
            
            // Log sample of failed data for debugging
            console.log('\n=== Failed Insert Data Sample ===')
            console.log(`Failed to insert ${insertData.length} rows into ${targetTable}`)
            console.log(`Error details: ${errorMsg}`)
            
            if (insertData.length > 0) {
              console.log('\nFirst failed row:')
              const firstRow = insertData[0]
              Object.entries(firstRow).slice(0, 10).forEach(([key, value]) => {
                const valueType = value === null ? 'null' : typeof value
                console.log(`  ${key}: "${value}" (${valueType})`)
              })
              
              // Log all column names for debugging
              console.log('\nAll columns in data:')
              console.log(Object.keys(firstRow))
            }
          } else {
            processed += batch.length
          }
        }
      } catch (batchError) {
        failed += batch.length
        errors.push(`Batch ${i + 1}-${i + batch.length}: ${batchError.message}`)
        console.error('Batch processing error:', batchError)
      }
      
      // Update progress after each batch
      await supabaseAdmin
        .from('import_sheet_status')
        .update({
          processed_rows: processed + failed,
          failed_rows: failed
        })
        .eq('job_id', jobId)
        .eq('sheet_name', sheetName)
    }
    
  } catch (error) {
    errors.push(`Sheet processing error: ${error.message}`)
    failed = rowsToInsert.length - processed
    console.error('Processing error:', error)
  }
  
  return { processed, failed, errors }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle health check
  const url = new URL(req.url)
  if (url.pathname.includes('/health')) {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'process-import-sheet' }),
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
    
    // Handle test request from health check
    if (body.test === true) {
      return new Response(
        JSON.stringify({ status: 'ok', test: true }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      )
    }
    
    const { jobId, sheetName } = body
    
    if (!jobId || !sheetName) {
      throw new Error('Missing required parameters: jobId and sheetName')
    }
    
    console.log(`Processing sheet ${sheetName} for job ${jobId}`)
    
    // Update sheet status to processing
    await supabaseAdmin
      .from('import_sheet_status')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('job_id', jobId)
      .eq('sheet_name', sheetName)
    
    // Fetch all chunks for this sheet
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('import_chunks')
      .select('data, chunk_index')
      .eq('job_id', jobId)
      .eq('sheet_name', sheetName)
      .order('chunk_index')
    
    if (chunksError || !chunks || chunks.length === 0) {
      // Some sheets might not have data, that's OK
      console.log(`No chunks found for sheet ${sheetName}`)
      
      await supabaseAdmin
        .from('import_sheet_status')
        .update({
          status: 'completed',
          processed_rows: 0,
          failed_rows: 0,
          completed_at: new Date().toISOString(),
          error_message: 'No data found for this sheet'
        })
        .eq('job_id', jobId)
        .eq('sheet_name', sheetName)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          failed: 0,
          message: 'No data to process'
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      )
    }
    
    // Combine chunks
    const allData = chunks.flatMap(c => c.data || [])
    console.log(`Combined ${chunks.length} chunks into ${allData.length} rows`)
    
    if (allData.length === 0) {
      await supabaseAdmin
        .from('import_sheet_status')
        .update({
          status: 'completed',
          processed_rows: 0,
          failed_rows: 0,
          completed_at: new Date().toISOString()
        })
        .eq('job_id', jobId)
        .eq('sheet_name', sheetName)
      
      return new Response(
        JSON.stringify({ success: true, processed: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Get sheet mapping from template
    const { data: job } = await supabaseAdmin
      .from('import_jobs')
      .select('template_id')
      .eq('id', jobId)
      .single()
    
    // Always use ln_ prefix for imported tables
    let targetTable = `ln_${safeColumnName(sheetName)}`
    let columnMappings = []
    
    if (job?.template_id) {
      // Get template mappings
      const { data: template } = await supabaseAdmin
        .from('mapping_templates')
        .select('sheet_mappings')
        .eq('id', job.template_id)
        .single()
      
      if (template?.sheet_mappings?.sheets) {
        const sheetMapping = template.sheet_mappings.sheets.find(
          (s: any) => s.originalName === sheetName
        )
        
        if (sheetMapping) {
          // Check if this sheet should be skipped
          if (sheetMapping.skip === true) {
            console.log(`Sheet "${sheetName}" is marked to skip in template`)
            
            // Update sheet status to skipped
            await supabaseAdmin
              .from('import_sheet_status')
              .update({
                status: 'skipped',
                completed_at: new Date().toISOString(),
                error_message: 'Sheet marked as skip in template'
              })
              .eq('job_id', jobId)
              .eq('sheet_name', sheetName)
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                skipped: true,
                message: `Sheet "${sheetName}" skipped as per template configuration`
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          
          // Use template's mapped name but ensure ln_ prefix
          if (sheetMapping.mappedName) {
            // If template already has ln_ prefix, use it as is
            if (sheetMapping.mappedName.startsWith('ln_')) {
              targetTable = sheetMapping.mappedName
            } else {
              // Otherwise, add ln_ prefix
              targetTable = `ln_${sheetMapping.mappedName}`
            }
          }
          columnMappings = sheetMapping.columns || []
        }
      }
    }
    
    // If no mappings, auto-map columns
    if (columnMappings.length === 0 && allData.length > 0) {
      const firstRow = allData[0]
      columnMappings = Object.keys(firstRow).map(key => ({
        originalName: key,
        mappedName: safeColumnName(key),
        dataType: 'text'
      }))
    }
    
    console.log(`Target table: ${targetTable}, Column mappings: ${columnMappings.length}`)
    
    // Enhanced logging for debugging data issues
    if (allData.length > 0) {
      console.log('\n=== Data Analysis for Debugging ===')
      const firstRow = allData[0]
      console.log(`First row has ${Object.keys(firstRow).length} columns`)
      
      // Check for problematic column names
      const problematicCols = Object.keys(firstRow).filter(key => 
        /^\d/.test(key) || // Starts with number
        key.includes('$') || // Contains currency symbol
        key.includes(',') || // Contains comma
        key.includes('"') || // Contains quotes
        key.includes("'") || // Contains single quotes
        key.length > 63 // Too long
      )
      
      if (problematicCols.length > 0) {
        console.log(`⚠️  Found ${problematicCols.length} problematic column names:`)
        problematicCols.slice(0, 10).forEach(col => {
          console.log(`  - "${col}" -> "${safeColumnName(col)}"`)
        })
      }
      
      // Analyze data types in first few rows
      console.log('\n=== Sample Data Values ===')
      const sampleSize = Math.min(3, allData.length)
      for (let i = 0; i < sampleSize; i++) {
        console.log(`\nRow ${i + 1}:`)
        const row = allData[i]
        
        // Sample a few interesting columns
        const interestingCols = Object.entries(row).filter(([key, value]) => {
          return value !== null && value !== '' && (
            key.toLowerCase().includes('date') ||
            key.toLowerCase().includes('amount') ||
            key.toLowerCase().includes('rate') ||
            key.toLowerCase().includes('number') ||
            /^\d/.test(key) || // Columns starting with numbers
            (typeof value === 'string' && (value.includes('$') || value.includes(',')))
          )
        }).slice(0, 10)
        
        interestingCols.forEach(([key, value]) => {
          const valueType = value === null ? 'null' : 
                           value === '' ? 'empty' :
                           typeof value
          console.log(`  ${key}: "${value}" (${valueType})`)
        })
      }
      
      // Check column mappings
      console.log('\n=== Column Mappings Preview ===')
      columnMappings.slice(0, 10).forEach(mapping => {
        console.log(`  ${mapping.originalName} -> ${mapping.mappedName} (${mapping.dataType})`)
      })
    }
    
    // Update target table
    await supabaseAdmin
      .from('import_sheet_status')
      .update({ target_table: targetTable })
      .eq('job_id', jobId)
      .eq('sheet_name', sheetName)
    
    // Process data
    const { processed, failed, errors } = await processSheetData(
      jobId,
      sheetName,
      targetTable,
      columnMappings,
      allData
    )
    
    // Update final status
    const finalStatus = failed === 0 ? 'completed' : (processed === 0 ? 'failed' : 'partial')
    await supabaseAdmin
      .from('import_sheet_status')
      .update({
        status: finalStatus,
        processed_rows: processed,
        failed_rows: failed,
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.slice(0, 3).join('; ') : null
      })
      .eq('job_id', jobId)
      .eq('sheet_name', sheetName)
    
    // Clean up chunks after processing
    if (processed > 0 || failed === allData.length) {
      await supabaseAdmin
        .from('import_chunks')
        .delete()
        .eq('job_id', jobId)
        .eq('sheet_name', sheetName)
    }
    
    // Log completion
    await supabaseAdmin
      .from('import_logs')
      .insert({
        job_id: jobId,
        level: failed === 0 ? 'success' : (processed === 0 ? 'error' : 'warning'),
        message: `Sheet ${sheetName} processing complete: ${processed} rows imported${failed > 0 ? `, ${failed} failed` : ''}`,
        sheet_name: sheetName,
        details: { 
          processed, 
          failed, 
          target_table: targetTable,
          errors: errors.slice(0, 5) 
        }
      })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processed, 
        failed,
        errors: errors.slice(0, 5)
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
    
  } catch (error) {
    console.error('Edge function error:', error)
    
    // Try to update status even if there's an error
    if (req.json && req.json.jobId && req.json.sheetName) {
      await supabaseAdmin
        .from('import_sheet_status')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('job_id', req.json.jobId)
        .eq('sheet_name', req.json.sheetName)
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