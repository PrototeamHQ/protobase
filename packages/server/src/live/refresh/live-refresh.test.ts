import { describe, expect, it, vi } from 'vitest'
import { liveRefresh } from './live-refresh'

describe('liveRefresh', () => {
  it("writes a refresh for the person's pages", async () => {
    const write = vi.fn(async () => {})
    await liveRefresh(write).refresh({ user: 'u1' })
    expect(write).toHaveBeenCalledWith(['u1'])
  })

  it('does nothing in an app without a live stream', async () => {
    await expect(liveRefresh(undefined).refresh({ user: 'u1' })).resolves.toBeUndefined()
  })
})
