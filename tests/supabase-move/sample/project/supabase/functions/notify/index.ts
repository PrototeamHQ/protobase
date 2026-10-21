// Called by the on_todo_done trigger: keeps the last done todo per project in Deno KV and answers at once, mailing the
// team in the background.
const kv = await Deno.openKv()

Deno.serve(async (req) => {
  const { id, title } = await req.json()
  await kv.set(['done', id], { title, at: new Date().toISOString() }, { expireIn: 7 * 24 * 3600 * 1000 })
  EdgeRuntime.waitUntil(
    (async () => {
      for (const address of (Deno.env.get('TEAM_EMAILS') ?? '').split(',').filter(Boolean)) {
        await fetch('https://api.mail.example.com/send', {
          method: 'POST',
          headers: { authorization: `Bearer ${Deno.env.get('MAIL_API_KEY')}` },
          body: JSON.stringify({ to: address, subject: `Done: ${title}` }),
        })
      }
    })(),
  )
  return new Response(null, { status: 204 })
})
