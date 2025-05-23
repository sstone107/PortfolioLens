import { useState, useCallback } from 'react';
import { importManager } from '../../../services/importManagerService';
import { supabaseClient as supabase } from '../../../utility/supabaseClient';
import { useBatchImportStore } from '../../../store/batchImportStore';
import { useNotification } from '@refinedev/core';
import * as XLSX from 'xlsx';

interface BackgroundImportOptions {
  templateId?: string;
  templateData?: any;
}

export const useBackgroundImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const { open } = useNotification();
  const { 
    sheets,
    fileName,
    fileData 
  } = useBatchImportStore();

  const executeBackgroundImport = useCallback(async (options: BackgroundImportOptions = {}) => {
    if (isImporting) {
      open?.({ type: 'warning', message: 'Import already in progress' });
      return;
    }

    try {
      setIsImporting(true);

      // Validate that we have data to import
      if (!sheets || sheets.length === 0) {
        throw new Error('No data to import');
      }
      
      if (!fileData) {
        throw new Error('No file data available for import');
      }
      
      // Parse the full Excel file to get all data
      const workbook = XLSX.read(fileData, { type: 'array' });
      
      // Build the data structure from sheets
      const originalData: Record<string, any[]> = {};
      const tableMappings: Record<string, any> = {};
      const columnMappings: Record<string, any> = {};
      
      for (const sheet of sheets) {
        if (!sheet.skip) {
          const worksheet = workbook.Sheets[sheet.originalName];
          if (!worksheet) {
            console.warn(`Sheet ${sheet.originalName} not found in workbook`);
            continue;
          }
          
          // Convert sheet to JSON with headers
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            blankrows: false,
            range: sheet.headerRow || 0
          }) as unknown[][];
          
          if (jsonData.length > 0) {
            // Get headers from first row
            const headers = jsonData[0] as unknown[];
            const dataRows = jsonData.slice(1); // Skip header row
            
            // Convert to objects using column mappings
            originalData[sheet.originalName] = dataRows.map(row => {
              const obj: any = {};
              sheet.columns.forEach((col, index) => {
                if (!col.skip && index < headers.length) {
                  obj[col.originalName] = row[index];
                }
              });
              return obj;
            });
            
            console.log(`Loaded ${originalData[sheet.originalName].length} rows from sheet ${sheet.originalName}`);
          }
          
          // Build table mapping
          tableMappings[sheet.originalName] = {
            targetTable: sheet.mappedName,
            skip: sheet.skip
          };
          
          // Build column mappings
          columnMappings[sheet.originalName] = {};
          sheet.columns.forEach(col => {
            columnMappings[sheet.originalName][col.originalName] = {
              targetColumn: col.mappedName,
              dataType: col.dataType,
              skip: col.skip
            };
          });
        }
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create a mapping structure for the Edge Function
      const sheetMappingsData = {
        sheets: Object.entries(tableMappings).map(([sheetName, tableMapping]) => {
          const columns = columnMappings[sheetName] || {};
          
          return {
            originalName: sheetName,
            mappedName: tableMapping.targetTable,
            skip: tableMapping.skip,
            columns: Object.entries(columns).map(([sourceCol, mapping]) => ({
              originalName: sourceCol,
              mappedName: mapping.targetColumn,
              dataType: mapping.dataType || 'text',
              skip: mapping.skip
            }))
          };
        })
      };

      // Create or update template if requested
      let finalTemplateId = options.templateId;
      
      if (options.templateData) {
        const { data: template, error: templateError } = await supabase
          .rpc('save_mapping_template', {
            p_name: options.templateData.name,
            p_description: options.templateData.description,
            p_file_pattern: options.templateData.filePattern,
            p_sheet_mappings: sheetMappingsData,
            p_servicer_id: options.templateData.servicerId || null,
            p_source_file_type: options.templateData.sourceFileType || 'xlsx',
            p_header_row: 1,
            p_table_prefix: options.templateData.tablePrefix || null
          });

        if (templateError) {
          console.error('Failed to save template:', templateError);
        } else if (template) {
          finalTemplateId = template.id;
        }
      }

      // Create the import job
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          filename: fileName,
          bucket_path: '', // We'll update this after upload
          template_id: finalTemplateId,
          status: 'pending',
          user_id: user.id,
          parsed_locally: true,
          worker_id: crypto.randomUUID()
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error(`Failed to create import job: ${jobError?.message}`);
      }

      // Create sheet status records
      for (const sheet of sheetMappingsData.sheets) {
        if (!sheet.skip) {
          const sheetData = originalData[sheet.originalName] || [];
          
          await supabase
            .from('import_sheet_status')
            .insert({
              job_id: job.id,
              sheet_name: sheet.originalName,
              original_name: sheet.originalName,
              status: 'pending',
              total_rows: sheetData.length,
              target_table: sheet.mappedName
            });
        }
      }

      // Process each sheet
      for (const [sheetName, sheetData] of Object.entries(originalData)) {
        const mapping = sheetMappingsData.sheets.find(s => s.originalName === sheetName);
        if (!mapping || mapping.skip) continue;

        // Send chunks directly to the Edge Function
        const chunkSize = 1000;
        const totalChunks = Math.ceil(sheetData.length / chunkSize);

        for (let i = 0; i < sheetData.length; i += chunkSize) {
          const chunk = sheetData.slice(i, Math.min(i + chunkSize, sheetData.length));
          const chunkIndex = Math.floor(i / chunkSize);

          // Send chunk via RPC
          await supabase.rpc('receive_import_chunk', {
            p_job_id: job.id,
            p_sheet_name: sheetName,
            p_chunk_index: chunkIndex,
            p_total_chunks: totalChunks,
            p_data: chunk,
            p_row_count: chunk.length
          });
        }

        // Once all chunks are received, trigger processing
        await supabase.functions.invoke('process-import-sheet', {
          body: { 
            jobId: job.id,
            sheetName: sheetName
          }
        });
      }

      // Update job status
      await supabase
        .from('import_jobs')
        .update({ status: 'processing' })
        .eq('id', job.id);

      open?.({
        type: 'success',
        message: 'Import started successfully!',
        description: 'Processing in background...'
      });

      // Return the job ID so we can navigate to status page
      return job.id;

    } catch (error) {
      console.error('Background import error:', error);
      open?.({
        type: 'error',
        message: 'Failed to start import',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      setIsImporting(false);
    }
  }, [sheets, fileName, fileData, open, isImporting]);

  return {
    executeBackgroundImport,
    isImporting
  };
};