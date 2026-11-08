import { bridgeSocketPath } from '@protobase/schema/internal'
import type { SocketLike } from './channel-connection'
import type { Transport } from './transport'

/** What a bridge function answers when asked for a token. */
type BridgeToken = { token: string; open_by: string; expires_at: string }

/** An open bridge: its socket, which passes `ArrayBuffer`s both ways, and when the server closes it. */
export type OpenedBridge = { socket: WebSocket; expiresAt: Date }

export type BridgesInput = {
  send: Transport
  /** The `ws:` or `wss:` URL of a path below the API's system path, such as `/functions/console?token=…`. */
  socketUrl: (path: string) => string
  socket: (url: string, protocols: string[]) => SocketLike
}

/**
 * The app's TCP bridges, functions made with `tcpBridge` on the server: `open(name, target)` asks the function
 * `/api/functions/<name>` for a token to `target`, then opens the bridge's socket with it, binary as `ArrayBuffer`s.
 * A target the caller may not reach rejects with an `ApiError` of status 404. The server closes the socket at
 * `expiresAt`; open the bridge again for more.
 */
export const bridgesClient = ({ send, socketUrl, socket }: BridgesInput) => ({
  open: async (name: string, target: string): Promise<OpenedBridge> => {
    const path = `/functions/${encodeURIComponent(name)}`
    const response = await send({ method: 'POST', path, system: true, body: { target } })
    const { token, expires_at } = (await response.json()) as BridgeToken
    const opened = socket(socketUrl(bridgeSocketPath(path, token)), [])
    opened.binaryType = 'arraybuffer'
    return { socket: opened as unknown as WebSocket, expiresAt: new Date(expires_at) }
  },
})
