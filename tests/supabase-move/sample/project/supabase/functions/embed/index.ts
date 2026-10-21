// The embedding of a text with Supabase's built-in gte-small, and its slug.
import { slugify } from 'https://deno.land/x/slugify@0.3.0/mod.ts'

const session = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  const { text } = await req.json()
  const embedding = await session.run(text, { mean_pool: true, normalize: true })
  return Response.json({ slug: slugify(text), embedding })
})
