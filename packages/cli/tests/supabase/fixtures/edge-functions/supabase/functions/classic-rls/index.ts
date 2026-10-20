// The style of Supabase's docs before 2026: std serve, esm.sh imports, the caller's token forwarded.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  })
  const { data, error } = await supabase.from('todos').select('title')
  return new Response(JSON.stringify({ data, error }), { headers: { 'Content-Type': 'application/json' } })
})
