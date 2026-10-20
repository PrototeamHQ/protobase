// A background task after the response, as Supabase's background-tasks guide shows.
Deno.serve(async (req) => {
  const started = Date.now()
  EdgeRuntime.waitUntil(new Promise((resolve) => setTimeout(() => { console.log('background done', Date.now() - started); resolve(null) }, 500)))
  return new Response(JSON.stringify({ queued: true }), { headers: { 'Content-Type': 'application/json' } })
})
