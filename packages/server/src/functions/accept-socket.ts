import type { Context } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import { HttpProblem } from '../problem'
import { socketEvents, type SocketEvents } from './function-socket'
import { capSocketMessages, honorsSocketMessageCaps, isSocketMessageCap } from './socket-message-cap'

export type SocketAcceptorInput = {
  c: Context
  /**
   * The host's WebSocket upgrade, `@hono/node-server`'s `upgradeWebSocket`, the only one supported: function sockets use
   * its `ws` socket's send callback and `bufferedAmount`. Without it, no function accepts a socket.
   */
  upgradeWebSocket?: UpgradeWebSocket
  report: (error: unknown) => void
  recheck?: () => Promise<unknown>
}

const marker = 'protobase-websocket'

// What `@hono/node-server`'s upgrade hands the app as its env: the upgrade's Node request and the ws server that upgrades it.
type UpgradeEnv = { incoming?: unknown; wss?: unknown } | undefined

/**
 * One call's `acceptWebSocket` and what turns its answer into the upgrade. `accept` only records the events and returns
 * a marker response; `answer` upgrades once the function has returned it, so a caller that is refused, or a function
 * that throws, never gets a socket.
 */
export const socketAcceptor = ({ c, upgradeWebSocket, report, recheck }: SocketAcceptorInput) => {
  let accepted: SocketEvents | undefined
  const accept = (events: SocketEvents) => {
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
      throw new HttpProblem(426, 'upgrade-required', 'Upgrade Required', 'Open this function with a WebSocket', {}, { upgrade: 'websocket' })
    }
    if (!upgradeWebSocket) throw new Error('This server does not accept WebSockets')
    if (accepted) throw new Error('acceptWebSocket can only be called once')
    if (events.maxMessageBytes !== undefined) {
      if (!isSocketMessageCap(events.maxMessageBytes)) throw new TypeError(`maxMessageBytes must be a whole number of bytes of at least 1, not ${String(events.maxMessageBytes)}`)
      // A ws server that would ignore the cap refuses the socket rather than let it take 100 MiB messages.
      const env = c.env as UpgradeEnv
      if (typeof env?.incoming !== 'object' || env.incoming === null || !honorsSocketMessageCaps(env.wss)) {
        throw new Error("This server cannot cap a socket's messages: serve the app with protobase dev or protobase serve")
      }
    }
    accepted = events
    return new Response(null, { headers: { [marker]: 'accept' } })
  }
  const answer = (name: string, response: Response) => {
    if (!accepted) return response
    if (!response.headers.has(marker)) throw new Error(`The function "${name}" accepted a WebSocket but answered with another response`)
    // Marked only now, so only a socket that really upgrades carries its cap.
    if (accepted.maxMessageBytes !== undefined) capSocketMessages((c.env as UpgradeEnv)!.incoming as object, accepted.maxMessageBytes)
    return upgradeWebSocket!(c, socketEvents(accepted, { report, ...(recheck && { recheck }) }), { onError: report })
  }
  return { accept, answer }
}
