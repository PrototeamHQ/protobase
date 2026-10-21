import { defineFunction, type FunctionSocket } from '@protobase/server'

// Everyone in the workshop chat, in this process.
const everyone = new Set<FunctionSocket>()

// /api/functions/workshop-chat, opened as a WebSocket by a signed-in page: each text message goes to everyone in the
// chat, with who sent it. Awaiting the sends holds the sender's next message back until everyone has this one.
export default defineFunction((_request, { session, acceptWebSocket }) => {
  let own: FunctionSocket | undefined
  return acceptWebSocket({
    onOpen: (socket) => {
      own = socket
      everyone.add(socket)
    },
    onMessage: async (data) => {
      if (typeof data !== 'string') return
      await Promise.all([...everyone].map((socket) => socket.send(`${session.user.id}: ${data}`)))
    },
    onClose: () => {
      if (own) everyone.delete(own)
    },
  })
})
