import { z } from 'npm:zod@4'
const Body = z.object({ name: z.string() })
Deno.serve(async (req) => {
  const { name } = Body.parse(await req.json())
  return Response.json({ message: `${Deno.env.get('GREETING') ?? 'Hello'} ${name}` })
})
