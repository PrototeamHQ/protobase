import { createAuthMiddleware } from 'better-auth/api'
import { invitationLink, invitationToken } from './invitation-token'

/**
 * Without a mailer an invitation cannot be emailed, so whoever invites, at one of `paths`, gets its link in the answer,
 * once, to pass on. The answer carries the invitation's `id` and `expiresAt`. Inviting again gives a new link, since it
 * moves the expiry.
 */
export const invitationLinkHook = (paths: string[], invitationUrl: string) => ({
  matcher: (context: { path?: string }) => paths.includes(context.path ?? ''),
  handler: createAuthMiddleware(async (ctx) => {
    const answer = await withInvitationLink(ctx.context.returned, ctx.context.secret, invitationUrl)
    if (answer) ctx.context.returned = answer
  }),
})

/** An invitation's answer with its `link` added; `undefined` for an error or an answer without an invitation. */
export const withInvitationLink = async (returned: unknown, secret: string, invitationUrl: string) => {
  const answer = returned as { id?: string; expiresAt?: Date | string } | undefined
  if (!answer || answer instanceof Response || answer instanceof Error || !answer.id || !answer.expiresAt) return undefined
  const token = await invitationToken(secret, { id: answer.id, expiresAt: new Date(answer.expiresAt) })
  return { ...answer, link: invitationLink(invitationUrl, token) }
}

/** The page an invitation link opens, with `?token=`, unless the app names another. */
export const defaultInvitationUrl = (baseURL: string) => `${baseURL.replace(/\/$/, '')}/-/invitation`

/** How long an invitation works unless the app says otherwise: 7 days, in seconds. */
export const defaultInvitationSeconds = 7 * 24 * 60 * 60
