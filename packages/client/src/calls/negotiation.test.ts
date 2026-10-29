import { describe, expect, it, vi } from 'vitest'
import { negotiation } from './negotiation'

describe('the negotiation', () => {
  it('has one offer in flight, and offers once more for every change that came meanwhile', async () => {
    const offer = vi.fn(async () => {})
    const offers = negotiation(offer)
    await offers.request()
    await offers.request()
    await offers.request()
    expect(offer).toHaveBeenCalledTimes(1)
    const settled = vi.fn()
    void offers.settled().then(settled)
    await offers.answered()
    expect(offer).toHaveBeenCalledTimes(2)
    await offers.answered()
    await Promise.resolve()
    expect(settled).toHaveBeenCalled()
  })

  it('offers again after an offer that will not be answered', async () => {
    const offer = vi.fn(async () => {})
    const offers = negotiation(offer)
    await offers.request()
    offers.abandon()
    expect(offers.pending).toBe(true)
    await offers.request()
    expect(offer).toHaveBeenCalledTimes(2)
  })

  it('lets whoever waits go on a reset', async () => {
    const offers = negotiation(async () => {})
    await offers.request()
    const waited = offers.settled()
    offers.reset()
    await expect(waited).resolves.toBeUndefined()
  })
})
