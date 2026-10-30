import { describe, expect, it, vi } from 'vitest'
import { guestLobby } from './guest-lobby'

describe("a guest's lobby", () => {
  it('enters with the link and a name, then asks after the wait with the guest token alone, sending no cookie', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === 'POST' ? { guest: 'g1', token: 'pbg_eve' } : { state: 'waiting' }, { status: init?.method === 'POST' ? 201 : 200 }))
    const lobby = guestLobby({ fetch: fetch as unknown as typeof globalThis.fetch })
    expect(lobby.socketUrl).toBe('/api/calls/guests/socket')
    expect(await lobby.enter('pbgl_link', 'Eve')).toEqual({ guest: 'g1', token: 'pbg_eve' })
    expect(await lobby.wait('pbg_eve')).toEqual({ state: 'waiting' })
    expect(fetch.mock.calls[0]).toEqual(['/api/calls/guests/lobby', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"link":"pbgl_link","name":"Eve"}', credentials: 'omit', cache: 'no-store' }])
    expect(fetch.mock.calls[1]![1]).toMatchObject({ method: 'GET', headers: { authorization: 'Bearer pbg_eve' }, credentials: 'omit' })
  })

  it('rejects with the status and the reason when the lobby refuses', async () => {
    const fetch = async () => Response.json({ detail: 'This link lets nobody into a call' }, { status: 404 })
    await expect(guestLobby({ fetch: fetch as unknown as typeof globalThis.fetch }).enter('pbgl_x', 'Eve')).rejects.toMatchObject({ name: 'LobbyRefused', status: 404, message: 'This link lets nobody into a call' })
  })
})
