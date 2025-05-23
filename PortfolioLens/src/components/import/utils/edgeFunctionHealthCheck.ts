import { supabaseClient as supabase } from '../../../utility/supabaseClient';

/**
 * Health check result interface
 */
export interface EdgeFunctionHealthResult {
  available: boolean;
  corsWorking: boolean;
  endpointAccessible: boolean;
  authenticated: boolean;
  error?: string;
}

/**
 * Performs a comprehensive health check on Edge Functions
 * Tests availability, CORS, and authentication
 */
export async function checkEdgeFunctionHealth(): Promise<EdgeFunctionHealthResult> {
  const result: EdgeFunctionHealthResult = {
    available: false,
    corsWorking: false,
    endpointAccessible: false,
    authenticated: false
  };

  try {
    // Get Supabase URL from environment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('Supabase URL not configured');
      result.error = 'Supabase URL not configured';
      return result;
    }

    // Try using supabase.functions.invoke with a test/health endpoint
    try {
      const { data, error } = await supabase.functions.invoke('process-import-sheet', {
        body: { test: true }
      });

      if (!error) {
        // Function responded successfully
        result.available = true;
        result.endpointAccessible = true;
        result.authenticated = true;
        result.corsWorking = true;
        return result;
      }

      // Check error type
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        result.error = 'Edge Function not deployed';
        return result;
      }

      // Function exists but there was an error
      result.endpointAccessible = true;
      result.error = error.message;
    } catch (invokeError) {
      // Try direct health check endpoint (may fail due to CORS/Auth)
      const url = `${supabaseUrl}/functions/v1/process-import-sheet/health`;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        result.endpointAccessible = response.status !== 404;
        
        if (response.ok) {
          result.corsWorking = true;
          const data = await response.json();
          result.available = data?.status === 'ok';
        } else if (response.status === 401) {
          // Authentication required but endpoint exists
          result.available = true; // Function exists, just needs auth
          result.corsWorking = true; // CORS worked if we got 401
          result.error = 'Authentication required (normal for Edge Functions)';
        }
      } catch (fetchError) {
        // CORS or network error
        if (fetchError instanceof Error && fetchError.message.includes('CORS')) {
          result.error = 'CORS not configured (normal - use supabase.functions.invoke)';
        } else {
          result.error = fetchError instanceof Error ? fetchError.message : 'Network error';
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Edge Function health check error:', error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

/**
 * Get Edge Function status for display
 */
export async function getEdgeFunctionStatus(): Promise<{
  available: boolean;
  message: string;
}> {
  const health = await checkEdgeFunctionHealth();
  
  let message = 'Edge Functions are available';
  
  if (!health.available) {
    if (!health.endpointAccessible) {
      message = 'Edge Function not deployed. Deploy using: supabase functions deploy process-import-sheet';
    } else if (!health.authenticated) {
      message = 'Edge Function requires authentication (this is normal)';
    } else {
      message = health.error || 'Edge Functions are not available';
    }
  }
  
  return {
    available: health.available,
    message
  };
}