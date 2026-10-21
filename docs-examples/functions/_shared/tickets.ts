import { createHmac, timingSafeEqual } from 'node:crypto'
import { requireEnv } from '@protobase/server'

const lifetimeSeconds = 30

const signature = (payload: string) => createHmac('sha256', requireEnv('TICKET_SECRET')).update(payload).digest('base64url')

// A ticket names a user and when it expires, signed with the app's own secret.
export const mintTicket = (userId: string | number) => {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + lifetimeSeconds}`
  return `${payload}.${signature(payload)}`
}

// The user a ticket names, or undefined when it is forged or expired.
export const ticketUser = (ticket: string) => {
  const payload = ticket.slice(0, ticket.lastIndexOf('.'))
  const given = Buffer.from(ticket.slice(payload.length + 1))
  const expected = Buffer.from(signature(payload))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined
  const userId = payload.slice(0, payload.lastIndexOf('.'))
  const expires = Number(payload.slice(userId.length + 1))
  return expires * 1000 > Date.now() ? userId : undefined
}
