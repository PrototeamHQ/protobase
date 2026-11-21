import { SignJWT } from 'jose'

/** How long a ticket connects: a minute, within the relay's two. */
export const ticketSeconds = 60

/** Who a ticket connects: a signed-in person in their sign-in session, or an anonymous session, which only receives. */
export type TicketSubject = { user: string; session: string } | { anonymous: true; session: string }

/**
 * A connect ticket for the relay: a JWT signed with HS256 by the app's ticket key, once usable, for a minute, naming the
 * person or the anonymous session, the session the relay closes the socket with, and the channels it may join.
 */
export const signTicket = async (options: { app: string; ticketKey: string }, subject: TicketSubject, channels: readonly string[], now = new Date()) => {
  const expiresAt = new Date(now.getTime() + ticketSeconds * 1000)
  const claims = { sid: subject.session, channels: [...channels], ...('anonymous' in subject && { anonymous: true }) }
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(options.app)
    .setJti(crypto.randomUUID())
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
  if ('user' in subject) jwt.setSubject(subject.user)
  return { ticket: await jwt.sign(new TextEncoder().encode(options.ticketKey)), expiresAt }
}
