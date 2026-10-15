import { APIError } from 'better-auth/api'
import type { AuthContext } from '../organizations/store'
import { hashOf } from './sign-up-code'

// What a right code is traded for: a ticket that makes the account for its address, so the step that asks for the name
// and password takes no code. Kept in Better Auth's verification table under its hash, with the address as its value,
// for thirty minutes and once; a wrong ticket finds nothing, so guessing one costs the right one nothing.

/** How long a ticket from a right code makes the account, in seconds. */
export const signUpTicketLifetimeSeconds = 30 * 60

const identifierOf = async (ticket: string) => `sign-up-ticket-${await hashOf(ticket)}`

const randomTicket = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** A new ticket for `email`, whose code was right; the store keeps only its hash. */
export const issueSignUpTicket = async (context: AuthContext, email: string) => {
  const ticket = randomTicket()
  await context.internalAdapter.createVerificationValue({ identifier: await identifierOf(ticket), value: email, expiresAt: new Date(Date.now() + signUpTicketLifetimeSeconds * 1000) })
  return ticket
}

/**
 * Takes `ticket`, so it works once, and answers the address its code was right for. Taking it is atomic, so of two
 * requests with it only one gets through. Throws `SIGN_UP_TICKET_INVALID` for a ticket that is unknown, used or expired.
 */
export const consumeSignUpTicket = async (context: AuthContext, ticket: string) => {
  const consumed = await context.internalAdapter.consumeVerificationValue(await identifierOf(ticket))
  if (!consumed || new Date(consumed.expiresAt) < new Date()) {
    throw new APIError('BAD_REQUEST', { code: 'SIGN_UP_TICKET_INVALID', message: 'This sign-up took too long. Start again with your email address.' })
  }
  return consumed.value
}
