/** How a bridge closes from the server's end: its WebSocket close code and reason. */
export type BridgeClosing = { code: number; reason: string }

/** Why a bridge closes from the server's end. A client opens a new bridge, with a new token, after `expired`. */
export const bridgeClosings = {
  serviceEnded: { code: 1000, reason: 'The service closed the connection' },
  serviceFailed: { code: 1011, reason: 'The connection to the service failed' },
  textRefused: { code: 1003, reason: 'A bridge carries binary messages only' },
  expired: { code: 1008, reason: 'The bridge expired' },
  withdrawn: { code: 1008, reason: 'The target was withdrawn' },
} as const satisfies Record<string, BridgeClosing>
