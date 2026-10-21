import { defineFunction, unauthorized } from '@protobase/server'
import { ticketUser } from './_shared/tickets'

// /api/functions/display?ticket=…, the workshop's display board, opened as a WebSocket from a page with no session
// cookie of this app. Public, so it checks the ticket itself: a missing, forged or expired one gets a 401 and no socket.
// Nothing checks the ticket's user again while the socket is open, so `recheck` ends it after 15 minutes, as a signed-in
// token would end, and the board opens it again with a new ticket.
export default defineFunction({ public: true }, (request, { acceptWebSocket }) => {
  const user = ticketUser(new URL(request.url).searchParams.get('ticket') ?? '')
  if (!user) throw unauthorized('Get a ticket from /api/functions/display-ticket first')
  const until = Date.now() + 15 * 60_000
  return acceptWebSocket({
    onOpen: (socket) => socket.send(JSON.stringify({ shownFor: user })),
    recheck: () => {
      if (Date.now() >= until) throw unauthorized('Get a new ticket')
    },
  })
})
