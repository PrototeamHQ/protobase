import { describe, expect, it } from 'vitest'
import { statsOf } from './connection-stats'

describe('statsOf', () => {
  it("reads the selected pair's round trip and the received media's losses", () => {
    const stats = [
      { type: 'transport', id: 't', selectedCandidatePairId: 'p2' },
      { type: 'candidate-pair', id: 'p1', currentRoundTripTime: 0.9 },
      { type: 'candidate-pair', id: 'p2', currentRoundTripTime: 0.04 },
      { type: 'inbound-rtp', id: 'a', packetsLost: 1, packetsReceived: 99 },
      { type: 'inbound-rtp', id: 'v', packetsLost: 9, packetsReceived: 891 },
    ]
    expect(statsOf(stats)).toEqual({ roundTripMs: 40, lostRatio: 0.01 })
  })

  it('reads the pair a transport-less browser marks selected', () => {
    expect(statsOf([{ type: 'candidate-pair', id: 'p', selected: true, currentRoundTripTime: 0.1 }])).toEqual({ roundTripMs: 100 })
  })

  it('says nothing it was not told', () => {
    expect(statsOf([{ type: 'candidate-pair', id: 'p' }])).toEqual({})
  })
})
