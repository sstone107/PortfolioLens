import { supabaseClient as supabase } from '../../../utility/supabaseClient';

/**
 * Performs a health check on Edge Functions to ensure they're available
 * @returns Promise<boolean> - true if Edge Functions are available
 */
export async function checkEdgeFunctionHealth(): Promise<boolean> {
  try {
    // Get Supabase URL from environment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('Supabase URL not configured');
      return false;
    }
    
    // Check if the process-import-sheet function is available by calling its health endpoint
    const url = `${supabaseUrl}/functions/v1/process-import-sheet/health`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.error('Edge Function health check failed:', response.status, response.statusText);
      return false;
    }
    
    const data = await response.json();
    return data?.status === 'ok';
  } catch (error) {
    console.error('Edge Function health check error:', error);
    return false;
  }
}

/**
 * Get Edge Function status for display
 */
export async function getEdgeFunctionStatus(): Promise<{
  available: boolean;
  message: string;
}> {
  const isHealthy = await checkEdgeFunctionHealth();
  
  return {
    available: isHealthy,
    message: isHealthy 
      ? 'Edge Functions are available' 
      : 'Edge Functions are not available. Background import may not work properly.'
  };
}