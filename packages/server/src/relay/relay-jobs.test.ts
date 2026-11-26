import { describe, expect, it, vi } from 'vitest'
import { RelayRefusal, type RelayClient } from './relay-commands'
import { relayJobs } from './relay-jobs'

const fakeClient = (send: RelayClient['send'] = async () => 1) => ({ send: vi.fn(send), closeSession: vi.fn(async () => 1) })
const db = {} as never
const context = { db } as never

describe('relayJobs', () => {
  it('sends every command, passing over and reporting one the relay refuses', async () => {
    const refusal = new RelayRefusal(400, 'refused')
    const client = fakeClient(async (command) => {
      if (command.kind === 'add') throw refusal
      return 1
    })
    const report = vi.fn()
    const [send] = relayJobs({ client, sessionEnd: async () => undefined, moves: async () => [], report }).jobs
    await send!.options.run({ commands: [{ kind: 'add', channel: 'c/1', users: ['u1'] }, { kind: 'remove', channel: 'c/1', users: ['u1'] }] } as never, context)
    expect(client.send).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenCalledWith(refusal)
  })

  it('fails the send on any other error, so the job tries again', async () => {
    const client = fakeClient(async () => {
      throw new Error('down')
    })
    const [send] = relayJobs({ client, sessionEnd: async () => undefined, moves: async () => [], report: vi.fn() }).jobs
    await expect(send!.options.run({ commands: [{ kind: 'add', channel: 'c/1', users: ['u1'] }] } as never, context)).rejects.toThrow('down')
  })

  it("closes each deleted session's sockets", async () => {
    const client = fakeClient()
    const [, closeSessions] = relayJobs({ client, sessionEnd: async () => undefined, moves: async () => [], report: vi.fn() }).jobs
    await closeSessions!.options.run({ sessions: ['s1', 's2'] } as never, context)
    expect(client.closeSession.mock.calls).toEqual([['s1'], ['s2']])
  })

  it("closes an expired or gone session's sockets at its expiry", async () => {
    const client = fakeClient()
    const [, , expiry] = relayJobs({ client, sessionEnd: async () => new Date(Date.now() - 1000), moves: async () => [], report: vi.fn() }).jobs
    await expiry!.options.run({ session: 's1' } as never, context)
    expect(client.closeSession).toHaveBeenCalledWith('s1')
  })

  it('waits for the new expiry of a session that was extended', async () => {
    const client = fakeClient()
    const later = new Date(Date.now() + 60_000)
    const [, , expiry] = relayJobs({ client, sessionEnd: async () => later, moves: async () => [], report: vi.fn() }).jobs
    const enqueue = vi.spyOn(expiry!, 'enqueue').mockResolvedValue(undefined as never)
    await expiry!.options.run({ session: 's1' } as never, context)
    expect(client.closeSession).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(db, { session: 's1' }, { key: 's1', runAt: later })
  })

  it("queues the moves of an organization's members after the sends queued before, and nothing without any", async () => {
    const add = { kind: 'add' as const, channel: 'channels/1', users: ['ann'] }
    const moves = vi.fn(async (_db: unknown, pairs: readonly unknown[]) => (pairs.length > 0 ? [add] : []))
    const [send, , , organizationMembers] = relayJobs({ client: fakeClient(), sessionEnd: async () => undefined, moves, report: vi.fn() }).jobs
    const enqueue = vi.spyOn(send!, 'enqueue').mockResolvedValue(undefined as never)
    const job = { db, job: { id: 'job-1' } } as never
    await organizationMembers!.options.run({ members: [{ organization: 'o1', user: 'ann' }] } as never, job)
    expect(moves).toHaveBeenCalledWith(db, [{ organization: 'o1', user: 'ann' }], 'job-1')
    expect(enqueue).toHaveBeenCalledWith(db, { commands: [add] }, { group: 'relay' })
    await organizationMembers!.options.run({ members: [] } as never, job)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })
})
