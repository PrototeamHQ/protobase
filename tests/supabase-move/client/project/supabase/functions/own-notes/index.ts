// The caller's notes, read as the caller: the client of supabase-js with the anon key and the caller's token.
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  })
  const { data, error } = await supabase.from('notes').select('body').order('id')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
})
