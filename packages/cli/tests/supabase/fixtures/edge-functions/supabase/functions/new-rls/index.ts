// examples/edge-functions/.../select-from-table-with-auth-rls, on the todos table.
import { withSupabase } from 'npm:@supabase/server@^1'

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { data, error } = await ctx.supabase.from('todos').select('title')
    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ user: ctx.userClaims?.id, data })
  }),
}
