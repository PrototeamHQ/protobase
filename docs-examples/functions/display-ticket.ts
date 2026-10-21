import { defineFunction } from '@protobase/server'
import { mintTicket } from './_shared/tickets'

// POST /api/functions/display-ticket, from the display board's page: a ticket that opens its socket for 30 seconds.
export default defineFunction({ roles: ['mechanic'], cors: { origin: 'https://workshop.pips-bikes.example' } }, (_request, { session }) =>
  Response.json({ ticket: mintTicket(session.user.id) }),
)
