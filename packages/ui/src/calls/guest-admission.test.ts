import { afterEach, describe, expect, it, vi } from 'vitest'
import { LobbyRefused, type guestLobby, type GuestWait } from '@protobase/client/calls'
import { guestAdmission, NotLetIn, waitEveryMs } from './guest-admission'

const lobbyOf = (waits: (GuestWait | Error)[], entered: object | Error = { guest: 'g1', token: 'pbg_eve' }) => {
  const lobby = {
    socketUrl: '/api/calls/guests/socket',
    enter: vi.fn(async () => (entered instanceof Error ? Promise.reject(entered) : entered)),
    wait: vi.fn(async () => {
      const next = waits.shift()!
      return next instanceof Error ? Promise.reject(next) : next
    }),
    leave: vi.fn(async () => {}),
  }
  return lobby as typeof lobby & ReturnType<typeof guestLobby>
}

afterEach(() => {
  vi.useRealTimers()
})

describe("a guest's way into the call", () => {
  it('waits, asking once a second, until a member lets them in, with their token', async () => {
    vi.useFakeTimers()
    const lobby = lobbyOf([{ state: 'waiting' }, { state: 'waiting' }, { state: 'admitted', call: 'c1', publish: [] }])
    const admitted = guestAdmission(lobby, 'pbgl_link', 'Eve', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(2 * waitEveryMs)
    await expect(admitted).resolves.toBe('pbg_eve')
    expect(lobby.enter).toHaveBeenCalledWith('pbgl_link', 'Eve')
    expect(lobby.wait).toHaveBeenCalledTimes(3)
  })

  it('is refused when turned away, when the call or link is over, or the link lets nobody in', async () => {
    await expect(guestAdmission(lobbyOf([{ state: 'denied' }]), 'l', 'Eve', new AbortController().signal)).rejects.toEqual(new NotLetIn('denied'))
    await expect(guestAdmission(lobbyOf([{ state: 'ended' }]), 'l', 'Eve', new AbortController().signal)).rejects.toEqual(new NotLetIn('ended'))
    await expect(guestAdmission(lobbyOf([], new LobbyRefused(404, 'nope')), 'l', 'Eve', new AbortController().signal)).rejects.toMatchObject({ reason: 'refused' })
    await expect(guestAdmission(lobbyOf([new LobbyRefused(429, 'later')]), 'l', 'Eve', new AbortController().signal)).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('leaves the lobby when the page stops waiting', async () => {
    const controller = new AbortController()
    const lobby = lobbyOf([{ state: 'waiting' }])
    const admitted = guestAdmission(lobby, 'l', 'Eve', controller.signal)
    await vi.waitFor(() => expect(lobby.wait).toHaveBeenCalled())
    controller.abort()
    await expect(admitted).rejects.toEqual(new NotLetIn('ended'))
    expect(lobby.leave).toHaveBeenCalledWith('pbg_eve')
  })
})
