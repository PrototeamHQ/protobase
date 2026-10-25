/** The part of Better Auth's endpoint context that ending a replaced session reads. */
export type ReplacingContext = {
  getSignedCookie: (name: string, secret: string) => Promise<string | null | false>
  context: { authCookies: { sessionToken: { name: string } }; secret: string; internalAdapter: { deleteSession: (token: string) => Promise<void> } }
}

/**
 * Better Auth's `databaseHooks.session.create.after`: a sign-in in a browser ends the session that browser's cookie
 * held, whoever it was for, as the new session's cookie replaces it. Without this the old session would stand until it
 * expired, and with it the devices registered in it, which then kept getting their user's push in someone else's
 * browser. A staff sign-in as someone ends it too: nothing restores the earlier session when it stops.
 */
export const endReplacedSession = async (session: { token: string }, ctx: ReplacingContext | null) => {
  if (!ctx) return
  const held = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret)
  if (!held || held === session.token) return
  await ctx.context.internalAdapter.deleteSession(held)
}
