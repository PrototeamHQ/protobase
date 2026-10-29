/**
 * How one of the member's connections fares: to another member (`member`), or to the media server (no `member`). Its
 * state, and once connected, the round trip of its network path and the share of the media it received that was lost.
 */
export type CallConnection = { member?: string; state: RTCPeerConnectionState; roundTripMs?: number; lostRatio?: number }

type Stat = { type: string; id: string; [field: string]: unknown }

/** What `connectionOf` reads of a connection's stats: the selected candidate pair's round trip, and the received media's losses. */
export const statsOf = (report: Iterable<Stat>): Pick<CallConnection, 'roundTripMs' | 'lostRatio'> => {
  const stats = [...report]
  const transport = stats.find((stat) => stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string')
  // Firefox names no selected pair on its transport: it marks the pair itself.
  const pair = stats.find((stat) => stat.type === 'candidate-pair' && (stat.id === transport?.selectedCandidatePairId || (!transport && stat.selected === true) || (!transport && stat.nominated === true && stat.state === 'succeeded')))
  let lost = 0
  let received = 0
  for (const stat of stats) {
    if (stat.type !== 'inbound-rtp') continue
    lost += Math.max(0, Number(stat.packetsLost ?? 0))
    received += Number(stat.packetsReceived ?? 0)
  }
  const roundTrip = typeof pair?.currentRoundTripTime === 'number' ? pair.currentRoundTripTime * 1000 : undefined
  return { ...(roundTrip !== undefined && { roundTripMs: roundTrip }), ...(lost + received > 0 && { lostRatio: lost / (lost + received) }) }
}

/** How the connection fares now, as `CallConnection`. */
export const connectionOf = async (pc: RTCPeerConnection, member?: string): Promise<CallConnection> => {
  const state = pc.connectionState
  const report = state === 'connected' ? statsOf((await pc.getStats()).values() as Iterable<Stat>) : {}
  return { ...(member !== undefined && { member }), state, ...report }
}
