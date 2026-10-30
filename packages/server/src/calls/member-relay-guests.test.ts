import { describe, expect, it, vi } from 'vitest'
import type { CallLobbyGuest, CallServerMessage } from '@protobase/schema/internal'
import type { FunctionSocket } from '../functions/function-socket'
import { callHub, type GuestActions } from './call-hub'
import type { CallRights } from './call-member'
import { memberRelay } from './member-relay'
import { peerBackend } from './peer/peer-backend'
import { settle, standup } from './testing/call-harness'
import { memoryCallStore } from './testing/memory-call-store'

const guest = '7f1c2a4e-1b2c-4d3e-8f90-a1b2c3d4e5f6'
const link = { id: '0b6f3a1e-2c3d-4e5f-8a9b-c0d1e2f3a4b5', created_by: 'ann', publish: [], expires_at: null }

// A call over the memory store whose lobby has one guest waiting, with guest actions that record what they were asked.
const lobbyCall = () => {
  const store = memoryCallStore()
  const waiting: CallLobbyGuest[] = [{ guest, name: '<b>Eve</b>', since: '2026-10-30T10:00:00.000Z' }]
  const hub = callHub({ store, manyProcesses: false, report: vi.fn(), lobbies: async (calls) => new Map(calls.map((call) => [call, { guests: waiting, links: [link] }])) })
  const actions = {
    link: vi.fn<GuestActions['link']>(async (input) => ({ link: { ...link, publish: input.publish }, token: 'pbgl_x' })),
    revoke: vi.fn<GuestActions['revoke']>(async () => true),
    decide: vi.fn<GuestActions['decide']>(async () => ({})),
    remove: vi.fn<GuestActions['remove']>(async () => {}),
  }
  const join = async (member: string, { rights = { publish: true }, invites = false, name }: { rights?: CallRights; invites?: boolean; name?: string } = {}) => {
    const sent: CallServerMessage[] = []
    const browser = { send: async (data: string | ArrayBuffer | Uint8Array) => void sent.push(JSON.parse(String(data))), close: () => {}, bufferedAmount: 0 } satisfies FunctionSocket
    const events = memberRelay({ door: { admit: hub.admit, guests: actions }, backend: peerBackend({ kind: 'peer' }), record: standup, member, rights, maxMembers: 8, maxMinutes: 60, report: vi.fn(), invites, ...(name && { name }) })
    await events.onOpen!(browser)
    const send = async (message: object) => {
      await events.onMessage!(JSON.stringify(message), browser)
      await settle()
    }
    await send({ type: 'join' })
    const of = <T extends CallServerMessage['type']>(type: T) => sent.filter((message) => message.type === type) as Extract<CallServerMessage, { type: T }>[]
    return { send, of }
  }
  return { actions, join }
}

describe("a member's guests", () => {
  it('are shown, with the lobby, only to a member who invites', async () => {
    const { join } = lobbyCall()
    const ann = await join('ann', { invites: true, name: 'Ann' })
    const bob = await join('bob')
    expect(ann.of('lobby').at(-1)).toEqual({ type: 'lobby', guests: [{ guest, name: '<b>Eve</b>', since: '2026-10-30T10:00:00.000Z' }], links: [link] })
    expect(bob.of('lobby')).toEqual([])
    expect(bob.of('members').at(-1)!.members).toEqual([expect.objectContaining({ member: 'ann', name: 'Ann' }), { member: 'bob', joined_at: expect.any(String) }])
  })

  it("are refused to a member who does not invite, as to a guest, whose relay never does", async () => {
    const { actions, join } = lobbyCall()
    const bob = await join('bob')
    for (const message of [{ type: 'guest-link', publish: ['camera'] }, { type: 'guest-link-revoke', link: link.id }, { type: 'guest-decide', guest, admit: true }, { type: 'guest-remove', guest }]) await bob.send(message)
    expect(bob.of('guest-refused')).toEqual(Array(4).fill({ type: 'guest-refused', reason: 'not-allowed' }))
    expect(Object.values(actions).every((action) => action.mock.calls.length === 0)).toBe(true)
  })

  it('make links that let a guest send only what the member may send themselves', async () => {
    const { actions, join } = lobbyCall()
    const ann = await join('ann', { invites: true, rights: { publish: ['microphone'] } })
    await ann.send({ type: 'guest-link', publish: ['camera', 'microphone', 'microphone'] })
    expect(actions.link).toHaveBeenCalledWith({ call: expect.any(String), member: 'ann', publish: ['microphone'] })
    expect(ann.of('guest-link')).toEqual([{ type: 'guest-link', link: { ...link, publish: ['microphone'] }, token: 'pbgl_x' }])
    const cy = await join('cy', { invites: true, rights: { publish: false } })
    await cy.send({ type: 'guest-link', publish: ['camera'] })
    expect(actions.link).toHaveBeenLastCalledWith(expect.objectContaining({ member: 'cy', publish: [] }))
  })

  it("decide, revoke and remove in the member's own call, and say why not", async () => {
    const { actions, join } = lobbyCall()
    const ann = await join('ann', { invites: true })
    actions.decide.mockResolvedValueOnce({ refused: 'full' })
    await ann.send({ type: 'guest-decide', guest, admit: true })
    expect(ann.of('guest-refused')).toEqual([{ type: 'guest-refused', reason: 'full' }])
    const call = actions.decide.mock.calls[0]![0].call
    expect(actions.decide).toHaveBeenCalledWith({ call, guest, member: 'ann', admit: true })
    await ann.send({ type: 'guest-decide', guest, admit: false })
    await ann.send({ type: 'guest-remove', guest })
    expect(actions.remove).toHaveBeenCalledWith(call, guest)
    actions.revoke.mockResolvedValueOnce(false)
    await ann.send({ type: 'guest-link-revoke', link: link.id })
    expect(actions.revoke).toHaveBeenCalledWith({ call, link: link.id, member: 'ann' })
    // One answer per request, in order.
    expect(ann.of('guest-refused').map((message) => message.reason)).toEqual(['full', 'gone'])
    expect(ann.of('guest-done')).toHaveLength(2)
  })

  it('wait for the member to be in the call', async () => {
    const { actions } = lobbyCall()
    const closes: unknown[] = []
    const browser = { send: async () => {}, close: (...args: unknown[]) => void closes.push(args), bufferedAmount: 0 } satisfies FunctionSocket
    const events = memberRelay({ door: { admit: vi.fn(), guests: actions }, backend: peerBackend({ kind: 'peer' }), record: standup, member: 'ann', rights: { publish: true }, maxMembers: 8, maxMinutes: 60, report: vi.fn(), invites: true })
    await events.onOpen!(browser)
    await events.onMessage!(JSON.stringify({ type: 'guest-decide', guest, admit: true }), browser)
    expect(closes).toEqual([[1008, 'Join or resume the call first']])
    expect(actions.decide).not.toHaveBeenCalled()
  })
})
