// Import Manager Service
// Singleton service for managing background imports with Web Workers

import { supabaseClient as supabase } from '../utility/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface ImportJob {
  id: string;
  filename: string;
  status: 'uploading' | 'parsing' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_sheet?: string;
  sheets_completed?: number;
  total_sheets?: number;
  created_at: Date;
  estimated_completion?: Date;
  error_message?: string;
}

export interface ImportLog {
  id: string;
  job_id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
  created_at: Date;
}

export interface JobUpdate {
  job?: ImportJob;
  log?: ImportLog;
  sheet_status?: any;
}

type JobUpdateCallback = (update: JobUpdate) => void;

class ImportManagerService {
  private static instance: ImportManagerService;
  private workers: Map<string, Worker> = new Map();
  private jobs: Map<string, ImportJob> = new Map();
  private subscriptions: Map<string, RealtimeChannel> = new Map();
  private callbacks: Map<string, Set<JobUpdateCallback>> = new Map();

  private constructor() {
    // Initialize service
    this.loadActiveJobs();
  }

  static getInstance(): ImportManagerService {
    if (!ImportManagerService.instance) {
      ImportManagerService.instance = new ImportManagerService();
    }
    return ImportManagerService.instance;
  }

  // Load active jobs from database
  private async loadActiveJobs() {
    try {
      const { data, error } = await supabase.rpc('get_active_import_jobs');
      
      if (error) {
        console.error('Failed to load active jobs:', error);
        return;
      }

      // Store jobs in memory
      data?.forEach(job => {
        this.jobs.set(job.id, {
          ...job,
          created_at: new Date(job.created_at),
          estimated_completion: job.estimated_completion ? new Date(job.estimated_completion) : undefined
        });
      });
    } catch (error) {
      console.error('Error loading active jobs:', error);
    }
  }

  // Start a new import
  async startImport(file: File, templateId?: string): Promise<string> {
    try {
      // 1. Create job record
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          filename: file.name,
          status: 'uploading',
          template_id: templateId,
          file_size: file.size,
          parsed_locally: true,
          worker_id: crypto.randomUUID()
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error(`Failed to create import job: ${jobError?.message}`);
      }

      // 2. Store job in memory
      const importJob: ImportJob = {
        id: job.id,
        filename: job.filename,
        status: 'uploading',
        progress: 0,
        created_at: new Date(job.created_at)
      };
      this.jobs.set(job.id, importJob);

      // 3. Start file upload in background
      this.uploadFileInBackground(file, job.id);

      // 4. Start Web Worker for parsing
      const worker = new Worker(
        new URL('../workers/importProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.workers.set(job.id, worker);

      // 5. Handle worker messages
      worker.onmessage = (event) => {
        this.handleWorkerMessage(job.id, event);
      };

      worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.handleWorkerError(job.id, error);
      };

      // 6. Get Supabase credentials for worker
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('No active session');
      }

      // 7. Start parsing
      worker.postMessage({
        type: 'PARSE_FILE',
        file,
        jobId: job.id,
        templateId,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        supabaseKey: session.data.session.access_token // Use user's token for RLS
      });

      // 8. Set up real-time subscriptions
      this.setupRealtimeSubscriptions(job.id);

      // 9. Update status to parsing
      await supabase
        .from('import_jobs')
        .update({ status: 'parsing' })
        .eq('id', job.id);

      return job.id;

    } catch (error) {
      console.error('Failed to start import:', error);
      throw error;
    }
  }

  // Upload file in background
  private async uploadFileInBackground(file: File, jobId: string) {
    try {
      const path = `imports/${jobId}/${file.name}`;
      
      const { error } = await supabase.storage
        .from('imports')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Update job with storage path
      await supabase
        .from('import_jobs')
        .update({ 
          bucket_path: path,
          uploaded_at: new Date().toISOString()
        })
        .eq('id', jobId);

      // Log success
      await this.logToJob(jobId, 'info', 'File uploaded successfully');

    } catch (error) {
      console.error('Upload error:', error);
      await this.logToJob(jobId, 'error', `File upload failed: ${error.message}`);
    }
  }

  // Handle worker messages
  private async handleWorkerMessage(jobId: string, event: MessageEvent) {
    const message = event.data;

    switch (message.type) {
      case 'PROGRESS':
        // Update job progress
        const job = this.jobs.get(jobId);
        if (job) {
          job.progress = message.progress;
          job.current_sheet = message.currentSheet;
          this.jobs.set(jobId, job);
        }

        // Update database
        await supabase
          .from('import_jobs')
          .update({
            progress: message.progress,
            current_sheet: message.currentSheet
          })
          .eq('id', jobId);

        // Log progress
        if (message.message) {
          await this.logToJob(jobId, 'info', message.message);
        }
        break;

      case 'COMPLETE':
        // Update job status
        await supabase
          .from('import_jobs')
          .update({
            status: 'processing',
            progress: 100,
            total_sheets: message.totalSheets,
            parsing_completed_at: new Date().toISOString()
          })
          .eq('id', jobId);

        await this.logToJob(jobId, 'success', 
          `Parsing complete: ${message.totalRows} rows from ${message.totalSheets} sheets`
        );

        // Clean up worker
        this.cleanupWorker(jobId);
        break;

      case 'ERROR':
        // Handle error
        await supabase
          .from('import_jobs')
          .update({
            status: 'failed',
            error_message: message.error
          })
          .eq('id', jobId);

        await this.logToJob(jobId, 'error', message.error, message.details);

        // Clean up worker
        this.cleanupWorker(jobId);
        break;
    }
  }

  // Handle worker errors
  private async handleWorkerError(jobId: string, error: ErrorEvent) {
    console.error('Worker error for job', jobId, error);
    
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: 'Worker error: ' + error.message
      })
      .eq('id', jobId);

    await this.logToJob(jobId, 'error', 'Worker error: ' + error.message);
    
    this.cleanupWorker(jobId);
  }

  // Clean up worker
  private cleanupWorker(jobId: string) {
    const worker = this.workers.get(jobId);
    if (worker) {
      worker.terminate();
      this.workers.delete(jobId);
    }
  }

  // Set up real-time subscriptions
  private setupRealtimeSubscriptions(jobId: string) {
    // Subscribe to job updates
    const channel = supabase
      .channel(`import-job-${jobId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'import_jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => {
        this.handleRealtimeUpdate(jobId, { job: payload.new as ImportJob });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'import_logs',
        filter: `job_id=eq.${jobId}`
      }, (payload) => {
        this.handleRealtimeUpdate(jobId, { log: payload.new as ImportLog });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'import_sheet_status',
        filter: `job_id=eq.${jobId}`
      }, (payload) => {
        this.handleRealtimeUpdate(jobId, { sheet_status: payload.new });
      })
      .subscribe();

    this.subscriptions.set(jobId, channel);
  }

  // Handle real-time updates
  private handleRealtimeUpdate(jobId: string, update: JobUpdate) {
    // Update local cache
    if (update.job) {
      this.jobs.set(jobId, {
        ...update.job,
        created_at: new Date(update.job.created_at),
        estimated_completion: update.job.estimated_completion 
          ? new Date(update.job.estimated_completion) 
          : undefined
      });
    }

    // Notify subscribers
    const callbacks = this.callbacks.get(jobId);
    if (callbacks) {
      callbacks.forEach(callback => callback(update));
    }
  }

  // Subscribe to job updates
  subscribeToJob(jobId: string, callback: JobUpdateCallback): () => void {
    // Add callback
    if (!this.callbacks.has(jobId)) {
      this.callbacks.set(jobId, new Set());
    }
    this.callbacks.get(jobId)!.add(callback);

    // Set up subscription if needed
    if (!this.subscriptions.has(jobId)) {
      this.setupRealtimeSubscriptions(jobId);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.callbacks.get(jobId);
      if (callbacks) {
        callbacks.delete(callback);
        
        // Clean up if no more callbacks
        if (callbacks.size === 0) {
          this.callbacks.delete(jobId);
          
          // Unsubscribe from real-time
          const channel = this.subscriptions.get(jobId);
          if (channel) {
            channel.unsubscribe();
            this.subscriptions.delete(jobId);
          }
        }
      }
    };
  }

  // Cancel import
  async cancelImport(jobId: string) {
    // Send cancel message to worker
    const worker = this.workers.get(jobId);
    if (worker) {
      worker.postMessage({ type: 'CANCEL', jobId });
    }

    // Update job status
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: 'Import cancelled by user'
      })
      .eq('id', jobId);

    await this.logToJob(jobId, 'warning', 'Import cancelled by user');

    // Clean up
    this.cleanupWorker(jobId);
    this.jobs.delete(jobId);
  }

  // Get active jobs
  getActiveJobs(): ImportJob[] {
    return Array.from(this.jobs.values())
      .filter(job => ['uploading', 'parsing', 'processing'].includes(job.status))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  // Get job by ID
  getJob(jobId: string): ImportJob | undefined {
    return this.jobs.get(jobId);
  }

  // Log to job
  private async logToJob(jobId: string, level: ImportLog['level'], message: string, details?: any) {
    try {
      await supabase
        .from('import_logs')
        .insert({
          job_id: jobId,
          level,
          message,
          details
        });
    } catch (error) {
      console.error('Failed to log:', error);
    }
  }

  // Clean up completed jobs (called periodically)
  async cleanupCompletedJobs() {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24); // Keep for 24 hours

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        ['completed', 'failed'].includes(job.status) &&
        job.created_at < cutoffDate
      ) {
        // Clean up subscriptions
        const channel = this.subscriptions.get(jobId);
        if (channel) {
          channel.unsubscribe();
          this.subscriptions.delete(jobId);
        }

        // Clean up callbacks
        this.callbacks.delete(jobId);

        // Remove from memory
        this.jobs.delete(jobId);
      }
    }
  }
}

// Export singleton instance
export const importManager = ImportManagerService.getInstance();

// Clean up old jobs periodically
setInterval(() => {
  importManager.cleanupCompletedJobs();
}, 60 * 60 * 1000); // Every hour