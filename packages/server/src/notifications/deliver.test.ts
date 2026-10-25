import { describe, expect, it } from 'vitest'
import { FatalJobError } from '../jobs/run-job'
import { StaleJobError } from '../jobs/job-progress'
import { deliver, type DeliverySteps } from './deliver'
import type { DeviceKind, NewDevice } from './device'
import type { DeviceStore } from './device-store'
import { guardedSender } from './guarded-sender'
import type { PushMessage } from './message'
import { noProgress, type Progress } from './push-payload'
import type { PushAnswer, PushSender } from './sender'
import { checkedSend, type NotificationRecipients } from './send-input'
import { memoryHistoryStore } from './testing/memory-history-store'
import { memoryDeviceStore } from './testing/memory-store'

const newDevice = (token: string, kind: DeviceKind = 'fcm', sessionId: string | null = null): NewDevice => ({ kind, token, p256dh: null, auth: null, environment: null, appId: null, userAgent: null, sessionId })

// A sender of `kinds` that records each batch and answers each device by its token, `ok` unless `answers` says.
const recordingSender = (answers: Record<string, PushAnswer['result'] | 'throw'> = {}, kinds: DeviceKind[] = ['fcm']) => {
  const batches: { message: PushMessage; tokens: string[] }[] = []
  const sender: PushSender = {
    kinds,
    send: async (message, devices) => {
      batches.push({ message, tokens: devices.map((device) => device.token) })
      if (devices.some((device) => answers[device.token] === 'throw')) throw new Error(`down for ${devices[0]!.token}`)
      return devices.map((device) => ({ id: device.id, result: (answers[device.token] as PushAnswer['result']) ?? 'ok' }))
    },
  }
  const tokens = () => batches.flatMap((batch) => batch.tokens)
  return { sender, batches, tokens }
}

// A job in memory: its stores, its progress between tries and whether it completed.
const harness = (options: { devices?: DeviceStore; senders?: PushSender[]; liveSessions?: DeliverySteps['liveSessions'] } = {}) => {
  const memory = memoryDeviceStore()
  const devices = options.devices ?? memory
  const history = memoryHistoryStore()
  let progress: Progress = noProgress()
  let completed = false
  let stale = false
  const steps = (): DeliverySteps => ({
    devices,
    senders: (options.senders ?? []).map(guardedSender),
    record: async (userId, entry, next) => {
      await history.record(userId, entry)
      progress = structuredClone(next)
    },
    save: async (next) => {
      progress = structuredClone(next)
    },
    hold: async () => {
      if (stale) throw new StaleJobError('notifications.send')
    },
    complete: async () => {
      completed = true
    },
    ...(options.liveSessions && { liveSessions: options.liveSessions }),
  })
  const run = (to: NotificationRecipients, message: PushMessage = { title: 'Hi' }) => deliver(checkedSend(to, message), progress, steps())
  // Another send: a job of its own, with no progress.
  const nextSend = () => {
    progress = noProgress()
    completed = false
  }
  // A device registered for a test, which these always keep.
  const register = async (userId: string, device: NewDevice) => (await devices.register(userId, device))!
  return { devices, register, stored: () => [...memory.devices.values()], history, run, nextSend, completed: () => completed, goStale: () => (stale = true) }
}

const entriesOf = (history: ReturnType<typeof memoryHistoryStore>) => [...history.entries.values()]

describe('deliver', () => {
  it('keeps an inbox send in each user history and pushes it to their devices', async () => {
    const push = recordingSender()
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('a-phone'))
    await job.register('b', newDevice('b-phone'))
    await job.run({ userIds: ['a', 'b'], inbox: true }, { title: 'Update', url: 'https://app.example/x' })
    expect(entriesOf(job.history).map((entry) => [entry.userId, entry.title, entry.url])).toEqual([['a', 'Update', 'https://app.example/x'], ['b', 'Update', 'https://app.example/x']])
    expect(push.tokens()).toEqual(['a-phone', 'b-phone'])
    expect(job.completed()).toBe(true)
  })

  it('only pushes a send that is not for the inbox, and a device send', async () => {
    const push = recordingSender()
    const job = harness({ senders: [push.sender] })
    const phone = await job.register('a', newDevice('a-phone'))
    await job.run({ userIds: ['a'], inbox: false })
    job.nextSend()
    await job.run({ deviceIds: [phone.id] })
    expect(entriesOf(job.history)).toEqual([])
    expect(await job.history.countUnread('a')).toBe(0)
    expect(push.tokens()).toEqual(['a-phone', 'a-phone'])
  })

  it('pushes each device the message alone, with nothing of the other recipients', async () => {
    const push = recordingSender()
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('a-phone'))
    await job.register('b', newDevice('b-phone'))
    await job.run({ userIds: ['a', 'b'], inbox: true }, { title: 'Hi', body: 'There' })
    expect(push.batches.map((batch) => batch.message)).toEqual([{ title: 'Hi', body: 'There' }, { title: 'Hi', body: 'There' }])
    expect(JSON.stringify(entriesOf(job.history).find((entry) => entry.userId === 'a'))).not.toContain('"b"')
  })

  it('on a retry records no history again and pushes only to the devices that asked for one', async () => {
    const answers: Record<string, PushAnswer['result']> = { 'a-tablet': 'retry' }
    const push = recordingSender(answers)
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('a-phone'))
    await job.register('a', newDevice('a-tablet'))
    await expect(job.run({ userIds: ['a'], inbox: true })).rejects.toThrow('notifications.send: 1 deliveries are retried')
    delete answers['a-tablet']
    await job.run({ userIds: ['a'], inbox: true })
    expect(entriesOf(job.history)).toHaveLength(1)
    expect(push.batches.map((batch) => batch.tokens.sort())).toEqual([['a-phone', 'a-tablet'], ['a-tablet']])
    expect(job.completed()).toBe(true)
  })

  it('gives up on a device that asks for a retry on two tries, removing nothing, and completes', async () => {
    const push = recordingSender({ forbidden: 'retry' })
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('forbidden'))
    await expect(job.run({ userIds: ['a'], inbox: false })).rejects.toThrow('1 deliveries are retried')
    await job.run({ userIds: ['a'], inbox: false })
    await job.run({ userIds: ['a'], inbox: false })
    expect(push.tokens()).toEqual(['forbidden', 'forbidden'])
    expect(job.stored().length).toBe(1)
    expect(job.completed()).toBe(true)
  })

  it('removes only a device answered gone, through the store', async () => {
    const push = recordingSender({ dead: 'gone', refused: 'refused' })
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('dead'))
    await job.register('a', newDevice('refused'))
    await job.register('a', newDevice('alive'))
    await job.register('b', newDevice('other'))
    await job.run({ userIds: ['a'], inbox: false })
    expect(job.stored().map((device) => device.token).sort()).toEqual(['alive', 'other', 'refused'])
  })

  it('leaves a batch whose sender throws to the next try, removing nothing, and skips kinds without a sender', async () => {
    const answers: Record<string, 'throw'> = { 'a-phone': 'throw' }
    const push = recordingSender(answers)
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('a-phone'))
    await job.register('a', newDevice('https://web.push.apple.com/a', 'web'))
    const failure = (await job.run({ userIds: ['a'], inbox: false }).catch((error: Error) => error)) as Error
    expect(failure.message).toBe('notifications.send: 1 deliveries are retried')
    expect(job.stored().length).toBe(2)
    delete answers['a-phone']
    await job.run({ userIds: ['a'], inbox: false })
    expect(push.tokens()).toEqual(['a-phone', 'a-phone'])
    expect(job.completed()).toBe(true)
  })

  it('pushes nothing of A to a device removed or moved to B before a retry', async () => {
    const answers: Record<string, PushAnswer['result']> = { shared: 'retry', 'a-old': 'retry' }
    const push = recordingSender(answers)
    const job = harness({ senders: [push.sender] })
    const old = await job.register('a', newDevice('a-old'))
    await job.register('a', newDevice('shared'))
    await expect(job.run({ userIds: ['a'], inbox: true })).rejects.toThrow()
    await job.devices.remove('a', old.id)
    await job.register('b', newDevice('shared'))
    delete answers.shared
    await job.run({ userIds: ['a'], inbox: true })
    expect(push.batches).toHaveLength(1)
    expect(job.completed()).toBe(true)
  })

  it('delivers nothing to a device of a device send that moved to someone else or was removed', async () => {
    const push = recordingSender()
    const job = harness({ senders: [push.sender] })
    const moved = await job.register('a', newDevice('moved'))
    const removed = await job.register('a', newDevice('removed'))
    await job.register('b', newDevice('moved'))
    await job.devices.remove('a', removed.id)
    await job.run({ deviceIds: [moved.id, removed.id] })
    expect(push.batches).toEqual([])
    expect(job.completed()).toBe(true)
  })

  it('pushes A and C once each when B is deleted or B has a device the sender refuses', async () => {
    const push = recordingSender({ 'b-broken': 'refused', 'c-phone': 'retry' })
    const job = harness({ senders: [push.sender] })
    for (const user of ['a', 'b', 'c']) await job.register(user, newDevice(user === 'b' ? 'b-broken' : `${user}-phone`))
    await expect(job.run({ userIds: ['a', 'b', 'c', 'deleted'], inbox: true })).rejects.toThrow('1 deliveries are retried')
    await job.run({ userIds: ['a', 'b', 'c', 'deleted'], inbox: true })
    expect(push.tokens()).toEqual(['a-phone', 'b-broken', 'c-phone', 'c-phone'])
    expect(entriesOf(job.history).map((entry) => entry.userId).sort()).toEqual(['a', 'b', 'c', 'deleted'])
    expect(job.stored().map((device) => device.token).sort()).toEqual(['a-phone', 'b-broken', 'c-phone'])
    expect(job.completed()).toBe(true)
  })

  it('without senders keeps an inbox send in the history and does nothing for one that is not, without failing', async () => {
    const job = harness()
    await job.register('a', newDevice('a-phone'))
    await job.run({ userIds: ['a'], inbox: false })
    expect(entriesOf(job.history)).toEqual([])
    job.nextSend()
    await job.run({ userIds: ['a'], inbox: true })
    expect(entriesOf(job.history)).toHaveLength(1)
    expect(job.completed()).toBe(true)
  })

  it('pushes nothing to devices the store gives that are not the recipients, and reports them by count', async () => {
    const push = recordingSender()
    const store = memoryDeviceStore()
    const own = (await store.register('a', newDevice('a-phone')))!
    const other = (await store.register('b', newDevice('b-phone')))!
    const leaky: DeviceStore = { ...store, listForUser: async () => [own, other], listByIds: async () => [own, other] }
    const job = harness({ devices: leaky, senders: [push.sender] })
    const sent = (await job.run({ userIds: ['a'], inbox: false }).catch((error: Error) => error)) as Error
    expect(sent).toBeInstanceOf(FatalJobError)
    expect(sent.message).toBe("notifications.send: delivered; devices the store gave that were not the recipients', which got nothing: 1 in listForUser")
    job.nextSend()
    const byId = (await job.run({ deviceIds: [own.id] }).catch((error: Error) => error)) as Error
    expect(byId.message).toContain('1 in listByIds')
    expect(push.tokens()).toEqual(['a-phone', 'a-phone'])
    expect(sent.message + byId.message).not.toContain(other.id)
  })

  it("keeps no token, endpoint or key of an app store's error, and goes on with the other users", async () => {
    const push = recordingSender()
    const store = memoryDeviceStore()
    await store.register('b', newDevice('b-phone'))
    const secret = 'https://fcm.googleapis.com/fcm/send/secret-endpoint auth=secret-auth token=secret-token'
    const leaking = () => Promise.reject(Object.assign(new Error(`duplicate key ${secret}`), { detail: `Key (token)=(${secret})`, cause: new Error(secret), code: '23505' }))
    const failing: DeviceStore = { ...store, listForUser: async (userId) => (userId === 'a' ? leaking() : store.listForUser(userId)), removeGone: leaking }
    const job = harness({ devices: failing, senders: [recordingSender({ 'b-phone': 'gone' }).sender] })
    const failure = (await job.run({ userIds: ['a', 'b'], inbox: false }).catch((error: Error) => error)) as Error
    expect(failure.message).toBe('notifications.send: 0 deliveries are retried; store failures: 1 in listForUser, 1 in removeGone')
    expect(JSON.stringify({ ...failure, message: failure.message, stack: failure.stack, cause: failure.cause })).not.toContain('secret')
    expect(push.batches).toEqual([])
  })

  it('stops a try that no longer holds its job before it pushes', async () => {
    const push = recordingSender()
    const job = harness({ senders: [push.sender] })
    await job.register('a', newDevice('a-phone'))
    job.goStale()
    await expect(job.run({ userIds: ['a'], inbox: false })).rejects.toBeInstanceOf(StaleJobError)
    expect(push.batches).toEqual([])
  })

  it('ends a send a sender refuses the message of for good, after the other devices', async () => {
    const refusing: PushSender = { kinds: ['web'], send: async () => Promise.reject(new (await import('./message')).PushMessageError('message: too large')) }
    const push = recordingSender()
    const job = harness({ senders: [push.sender, refusing] })
    await job.register('a', newDevice('a-phone'))
    await job.register('a', newDevice('https://web.push.apple.com/a', 'web'))
    await expect(job.run({ userIds: ['a'], inbox: false })).rejects.toThrow(new FatalJobError('notifications.send: a sender refused the message: message: too large'))
    expect(push.tokens()).toEqual(['a-phone'])
  })

  describe('with sessions', () => {
    // Session s-a stands for a, s-b for b; everything else has ended.
    const sessions = async (ids: readonly string[]) => new Map(ids.flatMap((id) => (id === 's-a' ? [[id, 'a']] : id === 's-b' ? [[id, 'b']] : [])) as [string, string][])

    it('pushes only to devices whose session stands for their user, and removes the others', async () => {
      const push = recordingSender()
      const job = harness({ senders: [push.sender], liveSessions: sessions })
      await job.register('a', newDevice('a-live', 'fcm', 's-a'))
      await job.register('a', newDevice('a-ended', 'fcm', 's-old'))
      await job.register('a', newDevice('a-none', 'fcm', null))
      await job.register('a', newDevice('a-on-b', 'fcm', 's-b'))
      const sent = await job.register('b', newDevice('b-live', 'fcm', 's-b'))
      await job.run({ userIds: ['a'], inbox: false })
      await job.run({ deviceIds: [sent.id] })
      expect(push.tokens()).toEqual(['a-live', 'b-live'])
      expect(job.stored().map((device) => device.token).sort()).toEqual(['a-live', 'b-live'])
      expect(job.completed()).toBe(true)
    })

    it('pushes to nothing and removes nothing when the sessions cannot be read, so the try is retried', async () => {
      const push = recordingSender()
      const job = harness({ senders: [push.sender], liveSessions: () => Promise.reject(new Error('auth store down')) })
      await job.register('a', newDevice('a-live', 'fcm', 's-a'))
      await job.register('a', newDevice('a-none', 'fcm', null))
      await expect(job.run({ userIds: ['a'], inbox: false })).rejects.toThrow('auth store down')
      expect(push.tokens()).toEqual([])
      expect(job.stored()).toHaveLength(2)
      expect(job.completed()).toBe(false)
    })
  })
})
