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

// Enhanced logging configuration
const ENABLE_DETAILED_LOGGING = true
const LOG_SAMPLE_SIZE = 5 // Number of rows to log in detail

interface DataTypeLog {
  column: string
  originalValue: any
  convertedValue: any
  targetType: string
  success: boolean
  error?: string
  issues?: string[]
}

const dataTypeLogs: DataTypeLog[] = []

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

// Enhanced coerce value with detailed logging
function coerceValue(value: any, type: string, columnName?: string, rowIndex?: number): any {
  const originalValue = value
  const issues: string[] = []
  
  if (value === null || value === undefined || value === '') {
    return null
  }
  
  try {
    let convertedValue: any = null
    
    // Handle string values with special characters
    if (typeof value === 'string') {
      // Check for quotes
      if (value.includes('"') || value.includes("'")) {
        issues.push('Contains quotes')
        // Remove surrounding quotes if present
        value = value.replace(/^["']|["']$/g, '')
      }
      
      // Trim whitespace
      value = value.trim()
    }
    
    switch (type.toLowerCase()) {
      case 'text':
      case 'varchar':
      case 'character varying':
        convertedValue = String(value)
        if (convertedValue.length > 255) {
          issues.push(`Text length ${convertedValue.length} exceeds typical varchar limit`)
        }
        break
      
      case 'numeric':
      case 'integer':
      case 'bigint':
      case 'smallint':
      case 'decimal':
      case 'real':
      case 'double precision':
        // Handle currency/number formats
        if (typeof value === 'string') {
          // Remove currency symbols and commas
          const cleanValue = value.replace(/[$,]/g, '')
          
          if (value.includes(',')) {
            issues.push('Number contains commas')
          }
          if (value.includes('$')) {
            issues.push('Number contains currency symbol')
          }
          
          const num = Number(cleanValue)
          if (isNaN(num)) {
            issues.push(`Cannot parse "${value}" as number`)
            convertedValue = null
          } else {
            convertedValue = num
          }
        } else {
          const num = Number(value)
          convertedValue = isNaN(num) ? null : num
        }
        break
      
      case 'boolean':
      case 'bool':
        if (typeof value === 'boolean') {
          convertedValue = value
        } else if (typeof value === 'string') {
          const lowered = value.toLowerCase()
          convertedValue = lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'y'
        } else {
          convertedValue = Boolean(value)
        }
        break
      
      case 'timestamp':
      case 'timestamptz':
      case 'timestamp with time zone':
      case 'timestamp without time zone':
        // Handle various date formats
        let dateValue = value
        
        // Check for Excel date serial numbers
        if (typeof value === 'number' && value > 25569 && value < 100000) {
          // Excel date (days since 1900-01-01)
          const excelDate = new Date((value - 25569) * 86400 * 1000)
          dateValue = excelDate
          issues.push('Converted from Excel date serial')
        }
        
        const timestamp = new Date(dateValue)
        if (isNaN(timestamp.getTime())) {
          issues.push(`Cannot parse "${value}" as timestamp`)
          convertedValue = null
        } else {
          convertedValue = timestamp.toISOString()
        }
        break
      
      case 'date':
        // Handle various date formats
        let dateVal = value
        
        // Check for Excel date serial numbers
        if (typeof value === 'number' && value > 25569 && value < 100000) {
          const excelDate = new Date((value - 25569) * 86400 * 1000)
          dateVal = excelDate
          issues.push('Converted from Excel date serial')
        }
        
        const date = new Date(dateVal)
        if (isNaN(date.getTime())) {
          issues.push(`Cannot parse "${value}" as date`)
          convertedValue = null
        } else {
          // For date columns, return only the date portion (YYYY-MM-DD)
          convertedValue = date.toISOString().split('T')[0]
        }
        break
      
      case 'json':
      case 'jsonb':
        if (typeof value === 'string') {
          try {
            convertedValue = JSON.parse(value)
          } catch {
            // If can't parse as JSON, store as string
            convertedValue = value
            issues.push('Stored as string, not valid JSON')
          }
        } else {
          convertedValue = value
        }
        break
      
      default:
        convertedValue = String(value)
        issues.push(`Unknown type "${type}", converting to string`)
    }
    
    // Log if detailed logging is enabled and we're within sample size
    if (ENABLE_DETAILED_LOGGING && columnName && rowIndex !== undefined && rowIndex < LOG_SAMPLE_SIZE) {
      dataTypeLogs.push({
        column: columnName,
        originalValue: originalValue,
        convertedValue: convertedValue,
        targetType: type,
        success: true,
        issues: issues.length > 0 ? issues : undefined
      })
    }
    
    return convertedValue
    
  } catch (error) {
    console.error(`Error coercing value to ${type}:`, error)
    
    if (ENABLE_DETAILED_LOGGING && columnName) {
      dataTypeLogs.push({
        column: columnName,
        originalValue: originalValue,
        convertedValue: null,
        targetType: type,
        success: false,
        error: error.message,
        issues
      })
    }
    
    return null
  }
}

// Log summary of data type conversions
function logDataTypeSummary() {
  if (!ENABLE_DETAILED_LOGGING || dataTypeLogs.length === 0) return
  
  console.log('\n=== DATA TYPE CONVERSION SUMMARY ===')
  
  // Group by column
  const columnSummary: Record<string, {
    totalConversions: number
    failures: number
    issues: Record<string, number>
    samples: any[]
  }> = {}
  
  dataTypeLogs.forEach(log => {
    if (!columnSummary[log.column]) {
      columnSummary[log.column] = {
        totalConversions: 0,
        failures: 0,
        issues: {},
        samples: []
      }
    }
    
    const col = columnSummary[log.column]
    col.totalConversions++
    
    if (!log.success) {
      col.failures++
    }
    
    if (log.issues) {
      log.issues.forEach(issue => {
        col.issues[issue] = (col.issues[issue] || 0) + 1
      })
    }
    
    if (col.samples.length < 3) {
      col.samples.push({
        original: log.originalValue,
        converted: log.convertedValue,
        type: log.targetType
      })
    }
  })
  
  // Print summary
  Object.entries(columnSummary).forEach(([column, summary]) => {
    console.log(`\n${column}:`)
    console.log(`  Total conversions: ${summary.totalConversions}`)
    if (summary.failures > 0) {
      console.log(`  ⚠️  Failures: ${summary.failures}`)
    }
    
    if (Object.keys(summary.issues).length > 0) {
      console.log('  Issues:')
      Object.entries(summary.issues).forEach(([issue, count]) => {
        console.log(`    - ${issue}: ${count}`)
      })
    }
    
    if (summary.samples.length > 0) {
      console.log('  Samples:')
      summary.samples.forEach(sample => {
        console.log(`    "${sample.original}" -> "${sample.converted}" (${sample.type})`)
      })
    }
  })
  
  // Clear logs for next batch
  dataTypeLogs.length = 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { jobId, sheetName, targetTable, columnMappings, data, batchIndex = 0, batchSize = 100 } = await req.json()
    
    console.log(`Processing import job ${jobId}, sheet ${sheetName}, batch ${batchIndex}`)
    console.log(`Target table: ${targetTable}`)
    console.log(`Column mappings: ${columnMappings.length}`)
    console.log(`Data rows: ${data.length}`)
    
    if (ENABLE_DETAILED_LOGGING) {
      console.log('\n=== DETAILED IMPORT LOGGING ENABLED ===')
      console.log(`Will log detailed type conversions for first ${LOG_SAMPLE_SIZE} rows`)
    }
    
    // Process data in batches
    const startIdx = batchIndex * batchSize
    const endIdx = Math.min(startIdx + batchSize, data.length)
    const batch = data.slice(startIdx, endIdx)
    
    console.log(`Processing batch ${batchIndex}: rows ${startIdx + 1} to ${endIdx}`)
    
    // Prepare data for insertion
    const insertData: any[] = []
    
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j]
      const rowIndex = startIdx + j
      const insertRow: any = {
        import_job_id: jobId,
        import_row_number: rowIndex + 1
      }
      
      // Log first few rows in detail
      if (ENABLE_DETAILED_LOGGING && j < LOG_SAMPLE_SIZE) {
        console.log(`\n--- Processing Row ${rowIndex + 1} ---`)
        console.log('Raw data keys:', Object.keys(row).slice(0, 10))
      }
      
      // Extract loan numbers first (same as before)
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
      
      // Map columns based on template mappings
      for (const mapping of columnMappings) {
        const value = row[mapping.originalName]
        const columnName = safeColumnName(mapping.mappedName)
        
        // Use enhanced coerceValue with logging
        insertRow[columnName] = coerceValue(
          value, 
          mapping.dataType || 'text',
          ENABLE_DETAILED_LOGGING ? columnName : undefined,
          ENABLE_DETAILED_LOGGING ? j : undefined
        )
        
        // If the original mapped name started with a number and was transformed,
        // also check if there's a value under the original name
        if (mapping.mappedName !== columnName && !value && row[mapping.mappedName]) {
          insertRow[columnName] = coerceValue(
            row[mapping.mappedName], 
            mapping.dataType || 'text',
            ENABLE_DETAILED_LOGGING ? columnName : undefined,
            ENABLE_DETAILED_LOGGING ? j : undefined
          )
        }
      }
      
      // For ln_loan_information, ensure loan_number is set
      if (targetTable === 'ln_loan_information' && !insertRow.loan_number) {
        const loanNum = investorLoanNumber || valonLoanId || sellerLoanNumber || 
                        currentServicerLoanNumber || previousServicerLoanId || 
                        mersId || genericLoanNumber ||
                        insertRow.investor_loan_number || insertRow.valon_loan_id ||
                        insertRow.seller_loan_number || insertRow.current_servicer_loan_number ||
                        insertRow.previous_servicer_loan_id || insertRow.mers_id
        
        if (loanNum) {
          insertRow.loan_number = String(loanNum).trim()
        }
      }
      
      insertData.push(insertRow)
    }
    
    // Log data type conversion summary
    logDataTypeSummary()
    
    // Now insert the data (rest of the function remains the same)
    console.log(`Prepared ${insertData.length} rows for insertion`)
    
    // For ln_loan_information, use upsert to handle duplicates
    if (targetTable === 'ln_loan_information') {
      console.log('Using upsert for ln_loan_information to handle duplicate loan numbers')
      const { error: insertError } = await supabaseAdmin
        .from(targetTable)
        .upsert(insertData, {
          onConflict: 'loan_number',
          ignoreDuplicates: false // Update existing records
        })
      
      if (insertError) {
        console.error('Upsert error:', insertError)
        throw insertError
      }
    } else {
      // For other tables, use regular insert
      const { error: insertError } = await supabaseAdmin
        .from(targetTable)
        .insert(insertData)
      
      if (insertError) {
        console.error('Insert error:', insertError)
        throw insertError
      }
    }
    
    console.log(`Successfully inserted/updated ${insertData.length} rows`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        rowsProcessed: insertData.length,
        hasMore: endIdx < data.length,
        nextBatchIndex: endIdx < data.length ? batchIndex + 1 : null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Error processing import:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.details || null
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})