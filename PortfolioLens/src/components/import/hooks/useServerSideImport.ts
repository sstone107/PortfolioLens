import { useState, useCallback } from 'react';
import { supabaseClient as supabase } from '../../../utility/supabaseClient';
import { useNotification } from '@refinedev/core';
import { useBatchImportStore } from '../../../store/batchImportStore';

interface ServerSideImportOptions {
  templateId?: string;
  templateData?: any;
}

export const useServerSideImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const { open } = useNotification();
  const { fileName, fileData } = useBatchImportStore();

  const executeServerSideImport = useCallback(async (options: ServerSideImportOptions = {}) => {
    if (isImporting) {
      open?.({ type: 'warning', message: 'Import already in progress' });
      return;
    }

    try {
      setIsImporting(true);

      // Validate that we have file data
      if (!fileData) {
        throw new Error('No file data available for import');
      }
      
      if (!fileName) {
        throw new Error('No file name available');
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create the import job record first
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          filename: fileName,
          bucket_path: '', // We'll update this after upload
          template_id: options.templateId,
          status: 'pending',
          user_id: user.id,
          parsed_locally: false, // Server-side parsing
          worker_id: crypto.randomUUID()
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error(`Failed to create import job: ${jobError?.message}`);
      }

      // Upload file to storage
      const filePath = `${user.id}/${job.id}/${fileName}`;
      
      // Convert array buffer to blob
      const blob = new Blob([fileData], { 
        type: fileName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 
              fileName.endsWith('.csv') ? 'text/csv' : 
              'application/octet-stream' 
      });

      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('imports')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError || !uploadData) {
        // Delete the job if upload failed
        await supabase.from('import_jobs').delete().eq('id', job.id);
        throw new Error(`Failed to upload file: ${uploadError?.message}`);
      }

      // Update job with bucket path
      const { error: updateError } = await supabase
        .from('import_jobs')
        .update({ 
          bucket_path: uploadData.path,
          status: 'pending'
        })
        .eq('id', job.id);

      if (updateError) {
        console.error('Failed to update job with bucket path:', updateError);
      }

      // Create or update template if requested
      if (options.templateData) {
        try {
          const { data: template, error: templateError } = await supabase
            .rpc('save_mapping_template', {
              p_name: options.templateData.name,
              p_description: options.templateData.description,
              p_file_pattern: options.templateData.filePattern,
              p_sheet_mappings: options.templateData.sheetMappings,
              p_servicer_id: options.templateData.servicerId || null,
              p_source_file_type: options.templateData.sourceFileType || 'xlsx',
              p_header_row: 1,
              p_table_prefix: options.templateData.tablePrefix || null
            });

          if (!templateError && template) {
            // Update job with template ID
            await supabase
              .from('import_jobs')
              .update({ template_id: template.id })
              .eq('id', job.id);
          }
        } catch (templateError) {
          console.error('Failed to save template:', templateError);
          // Continue with import even if template save fails
        }
      }

      // Trigger the Edge Function to process the Excel file asynchronously
      // We don't wait for it to complete - just fire and forget
      supabase.functions.invoke(
        'process-excel-upload',
        {
          body: { jobId: job.id }
        }
      ).then(({ data, error }) => {
        if (error) {
          console.error('Edge function error:', error);
          // Update job status to error in the background
          supabase
            .from('import_jobs')
            .update({ 
              status: 'error',
              error_message: error.message,
              completed_at: new Date().toISOString()
            })
            .eq('id', job.id)
            .then(() => {
              console.log('Job marked as error due to Edge Function failure');
            });
        }
      }).catch(err => {
        console.error('Failed to invoke Edge Function:', err);
      });

      open?.({
        type: 'success',
        message: 'Import started successfully!',
        description: 'Processing in background on server...'
      });

      // Return the job ID so we can navigate to status page
      return job.id;

    } catch (error) {
      console.error('Server-side import error:', error);
      open?.({
        type: 'error',
        message: 'Failed to start import',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      setIsImporting(false);
    }
  }, [fileName, fileData, open, isImporting]);

  return {
    executeServerSideImport,
    isImporting
  };
};