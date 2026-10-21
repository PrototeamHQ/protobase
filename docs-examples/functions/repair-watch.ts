import { defineFunction, notFound } from '@protobase/server'

// /api/functions/repair-watch/7, opened as a WebSocket by a signed-in page: repair 7's status, for as long as the caller
// may see the repair. A repair their access rules hide is a 404 and no socket; once it moves out of their sight, such
// as to another mechanic, `recheck` rejects with that 404 and the socket closes with 1008 within a minute.
export default defineFunction({ roles: ['mechanic', 'desk'] }, async (request, { records, acceptWebSocket }) => {
  const id = Number(new URL(request.url).pathname.slice(1))
  if (!Number.isInteger(id) || id <= 0) throw notFound('Watch a repair at /api/functions/repair-watch/<id>')
  const { record: repair } = await records.get('repairs', id)
  return acceptWebSocket({
    onOpen: (socket) => socket.send(JSON.stringify({ status: repair.status })),
    recheck: () => records.get('repairs', id),
  })
})
