/** What `closeSockets` needs of a WebSocket server's clients, which both `ws` and Bun's built-in `ws` have. */
export type ClosableSocket = { close(code?: number, reason?: string): void; terminate(): void }

export type CloseSocketsOptions = { graceMs?: number; pollMs?: number }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Closes every open socket with 1001 (Going Away) and waits until they are gone, at most `graceMs`; whatever is still
 * open then, a socket opened meanwhile included, is dropped. A server's `close` waits for its sockets, which a
 * connected client never closes by itself.
 */
export const closeSockets = async (clients: Set<ClosableSocket>, { graceMs = 5000, pollMs = 50 }: CloseSocketsOptions = {}) => {
  for (const client of clients) client.close(1001, 'Server shutting down')
  const deadline = Date.now() + graceMs
  while (clients.size > 0 && Date.now() < deadline) await wait(pollMs)
  for (const client of clients) client.terminate()
}
