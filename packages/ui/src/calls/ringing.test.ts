import { describe, expect, it } from 'vitest'
import { ringingAt, ringsUntil } from './ringing'

const ring = (call: string, remaining_ms: number) => ({ call, resource: 'conversations', key: '7', started_by: 'ann', title: 'Ann is calling', body: null, remaining_ms })

describe('ringing', () => {
  it("stops each ring when the server's time left is up by this browser's clock, whatever its own clock says", () => {
    const shown = ringsUntil([ring('a', 30_000), ring('b', 5000)], 1_000_000)
    expect(ringingAt(shown, 1_000_000)).toEqual({ ringing: shown, next: 1_005_000 })
    expect(ringingAt(shown, 1_005_000)).toEqual({ ringing: [shown[0]], next: 1_030_000 })
    expect(ringingAt(shown, 1_030_000)).toEqual({ ringing: [], next: undefined })
  })
})
