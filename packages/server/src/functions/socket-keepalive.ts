/** What a `ws` socket has to be kept alive; Bun's built-in one has no `pong` event, so it is not. */
export type PingableSocket = {
  ping(): void
  terminate(): void
  on(event: 'pong', listener: () => void): unknown
}

export const isPingable = (raw: unknown): raw is PingableSocket =>
  typeof raw === 'object' && raw !== null && ['ping', 'terminate', 'on'].every((name) => typeof (raw as Record<string, unknown>)[name] === 'function')

/** How often an open function socket is pinged; one that has not answered the ping before by then is ended. */
export const keepaliveMs = 30_000

/**
 * Pings the socket every `everyMs` and ends it, without a closing handshake, when it did not answer the ping before:
 * a client that vanished without a close frame, such as a laptop gone to sleep, then closes within two intervals.
 * Browsers answer pings by themselves. Returns the function that stops it.
 */
export const keepAlive = (raw: PingableSocket, everyMs = keepaliveMs) => {
  let answered = true
  raw.on('pong', () => {
    answered = true
  })
  const timer = setInterval(() => {
    if (!answered) {
      clearInterval(timer)
      return raw.terminate()
    }
    answered = false
    raw.ping()
  }, everyMs)
  ;(timer as { unref?: () => void }).unref?.()
  return () => clearInterval(timer)
}
