const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * The bytes a WebSocket of npm `ws` was sent and has not written out, or `undefined` for any other raw socket. Only one
 * that has the sender and socket that `ws`'s `bufferedAmount` counts is taken: Bun's own `ws` shim has a
 * `bufferedAmount` too, but it stays 0 however much waits.
 */
export const bufferedOf = (raw: unknown) => {
  if (!isObject(raw) || !isObject(raw._sender) || !isObject(raw._socket)) return undefined
  const amount = raw.bufferedAmount
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined
}
