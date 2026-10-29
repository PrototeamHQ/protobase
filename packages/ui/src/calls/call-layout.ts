/**
 * How a call's tiles are laid out: `alone` while the member is the only one in it, `grid` for everyone at the same
 * size, `share` with a screen share large and the people in a strip beside or under it.
 */
export type CallLayout = { kind: 'alone' } | { kind: 'grid'; columns: number } | { kind: 'share'; sharer: string }

/** Below this width the view is a phone's: one column of two people, then two columns, and the strip goes under a share. */
export const narrowWidth = 640

/** The columns a grid of `count` tiles takes in a view `width` pixels wide: as square as fits, fewer on a phone. */
export const gridColumns = (count: number, width: number) => {
  if (width < narrowWidth) return count <= 2 ? 1 : 2
  return Math.min(4, Math.ceil(Math.sqrt(count)))
}

/** The layout for these people, the member included, and the member sharing their screen, the first of them if several do. */
export const callLayout = ({ people, sharers, width }: { people: number; sharers: readonly string[]; width: number }): CallLayout => {
  if (sharers[0] !== undefined) return { kind: 'share', sharer: sharers[0] }
  if (people <= 1) return { kind: 'alone' }
  return { kind: 'grid', columns: gridColumns(people, width) }
}

/** How a connection fares, as its tile shows it: poor past a round trip of 400 ms or a loss of 5% of the media. */
export const connectionQuality = ({ roundTripMs, lostRatio }: { roundTripMs?: number; lostRatio?: number }) => ((roundTripMs ?? 0) > 400 || (lostRatio ?? 0) > 0.05 ? 'poor' : 'good')

/** How long a connection may stay unconnected before its tile says the browser cannot connect to that person. */
export const connectGiveUpMs = 15_000

/** Whether the browser cannot connect to someone: their connection failed, or is not up `connectGiveUpMs` after they came. */
export const cannotConnect = (state: RTCPeerConnectionState | undefined, since: number, now: number) => state === 'failed' || (state !== 'connected' && now - since >= connectGiveUpMs)

/** The loudest of these levels, from 0 to 1, when one is loud enough to be someone speaking. */
export const activeSpeaker = (levels: ReadonlyMap<string, number>, threshold = 0.05) => {
  let loudest: [string, number] | undefined
  for (const [member, level] of levels) if (level >= threshold && (!loudest || level > loudest[1])) loudest = [member, level]
  return loudest?.[0]
}
