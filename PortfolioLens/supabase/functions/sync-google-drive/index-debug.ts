import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Debug version to check environment variables
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action } = await req.json()
    
    if (action === 'debug-env') {
      // Debug mode - check environment variables
      const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
      
      const debugInfo = {
        email: {
          present: !!email,
          length: email?.length || 0,
          value: email ? `${email.substring(0, 20)}...${email.substring(email.length - 20)}` : 'NOT SET',
          isServiceAccount: email?.includes('iam.gserviceaccount.com') || false
        },
        privateKey: {
          present: !!privateKey,
          length: privateKey?.length || 0,
          hasBeginMarker: privateKey?.includes('-----BEGIN PRIVATE KEY-----') || false,
          hasEndMarker: privateKey?.includes('-----END PRIVATE KEY-----') || false,
          hasNewlines: privateKey?.includes('\\n') || false,
          hasRealNewlines: privateKey?.includes('\n') || false,
          first50: privateKey ? privateKey.substring(0, 50) : 'NOT SET',
          last50: privateKey ? privateKey.substring(privateKey.length - 50) : 'NOT SET'
        }
      }
      
      // Try to parse the key
      if (privateKey) {
        try {
          const formattedKey = privateKey.replace(/\\n/g, '\n')
          const pemHeader = "-----BEGIN PRIVATE KEY-----"
          const pemFooter = "-----END PRIVATE KEY-----"
          const startIdx = formattedKey.indexOf(pemHeader)
          const endIdx = formattedKey.indexOf(pemFooter)
          
          debugInfo.privateKey.parsing = {
            formattedHasRealNewlines: formattedKey.includes('\n'),
            headerIndex: startIdx,
            footerIndex: endIdx,
            canExtractContent: startIdx !== -1 && endIdx !== -1
          }
          
          if (startIdx !== -1 && endIdx !== -1) {
            const content = formattedKey.substring(startIdx + pemHeader.length, endIdx).trim()
            debugInfo.privateKey.parsing.contentLength = content.replace(/\s/g, '').length
          }
        } catch (e) {
          debugInfo.privateKey.parsing = { error: e.message }
        }
      }
      
      return new Response(
        JSON.stringify(debugInfo, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Normal operation
    return new Response(
      JSON.stringify({ error: 'Use action: "debug-env" to debug' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})