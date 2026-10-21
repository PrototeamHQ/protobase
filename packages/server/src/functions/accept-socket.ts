import type { Context } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import { HttpProblem } from '../problem'
import { socketEvents, type SocketEvents } from './function-socket'

export type SocketAcceptorInput = {
  c: Context
  /** The host's WebSocket upgrade, such as `@hono/node-server`'s; without it, no function accepts a socket. */
  upgradeWebSocket?: UpgradeWebSocket
  report: (error: unknown) => void
  recheck?: () => Promise<unknown>
}

const marker = 'protobase-websocket'

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
    accepted = events
    return new Response(null, { headers: { [marker]: 'accept' } })
  }
  const answer = (name: string, response: Response) => {
    if (!accepted) return response
    if (!response.headers.has(marker)) throw new Error(`The function "${name}" accepted a WebSocket but answered with another response`)
    return upgradeWebSocket!(c, socketEvents(accepted, { report, ...(recheck && { recheck }) }), { onError: report })
  }
  return { accept, answer }
}
