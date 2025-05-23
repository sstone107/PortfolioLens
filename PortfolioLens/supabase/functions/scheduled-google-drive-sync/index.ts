import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Verify this is a scheduled job (you can add a secret token check here)
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    console.log('Starting scheduled Google Drive sync...')
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Trigger sync for all enabled configurations
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { 
          // Sync all active configs
          // Can adjust hoursBack based on sync frequency
          hoursBack: 1 // Only look at files from last hour if running hourly
        }
      }
    )

    if (error) {
      console.error('Sync error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('Scheduled sync completed:', data)
    
    // Log the sync run
    await supabase
      .from('scheduled_sync_logs')
      .insert({
        run_at: new Date().toISOString(),
        status: 'success',
        results: data
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced_at: new Date().toISOString(),
        results: data 
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Scheduled sync error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})