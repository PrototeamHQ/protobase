// Registered symbols rather than a module's own, as `protobase dev` loads the project's server modules through Vite, so
// the function that writes a mark and the CLI's WebSocket server that reads it may hold two copies of this module.
const capKey = Symbol.for('protobase.socketMessageCap')
const honoredKey = Symbol.for('protobase.socketMessageCapsHonored')

type Marked = { [capKey]?: unknown; [honoredKey]?: unknown }

/**
 * Whether `bytes` can cap a socket's messages: a whole number of at least 1. ws reads a cap of 0 as no limit and
 * truncates others to 32 bits, so nothing else may reach it.
 */
export const isSocketMessageCap = (bytes: unknown): bytes is number => typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 1

/**
 * Caps the messages of the socket upgraded from `incoming`, the upgrade's Node request, at `bytes`. A mark only ever
 * lowers an earlier one on the same request.
 */
export const capSocketMessages = (incoming: object, bytes: number) => {
  if (!isSocketMessageCap(bytes)) throw new TypeError(`A socket's message cap must be a whole number of bytes of at least 1, not ${String(bytes)}`)
  const earlier = socketMessageCapOf(incoming)
  ;(incoming as Marked)[capKey] = earlier === undefined ? bytes : Math.min(earlier, bytes)
}

/** The message cap `capSocketMessages` marked on the upgrade's Node request; none for a mark that is no valid cap. */
export const socketMessageCapOf = (incoming: object): number | undefined => {
  const bytes = (incoming as Marked)[capKey]
  return isSocketMessageCap(bytes) ? bytes : undefined
}

/** Marks a ws server as one that applies `socketMessageCapOf`, without which a function's cap is refused. */
export const honorSocketMessageCaps = (server: object) => {
  ;(server as Marked)[honoredKey] = true
}

/** Whether `server`, the host's ws server, applies the message caps. */
export const honorsSocketMessageCaps = (server: unknown) => typeof server === 'object' && server !== null && (server as Marked)[honoredKey] === true
