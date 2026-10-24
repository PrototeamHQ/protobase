import { describe, expect, it } from 'vitest'
import type { Device } from './device'
import { guardedSender, PushSenderError } from './guarded-sender'
import { PushMessageError, type PushMessage } from './message'
import type { PushSender } from './sender'

const deviceOf = (id: string, kind: Device['kind'] = 'fcm'): Device => ({ id, userId: 'user', kind, token: `token-${id}`, p256dh: null, auth: null, environment: null, appId: null, userAgent: null, createdAt: new Date(0), lastSeenAt: new Date(0) })

const recording = (answer: (devices: readonly Device[]) => unknown) => {
  const calls: { message: PushMessage; devices: readonly Device[] }[] = []
  const sender: PushSender = {
    kinds: ['fcm'],
    send: async (message, devices) => {
      calls.push({ message, devices })
      return answer(devices) as never
    },
  }
  return { sender, calls }
}

describe('guardedSender', () => {
  it('answers each device of the batch once, dropping stray, duplicate and unknown answers', async () => {
    const { sender } = recording(() => [
      { id: 'a', result: 'ok' },
      { id: 'a', result: 'gone' },
      { id: 'other-users-device', result: 'gone' },
      { id: 'web-device', result: 'gone' },
      { id: 'b', result: 'deleted' },
      { id: 'c', result: 'retry', retryAfterSeconds: -5 },
      { id: 'd', result: 'gone', retryAfterSeconds: 10 },
      { id: 'f', result: 'refused' },
      null,
    ])
    const devices = [deviceOf('a'), deviceOf('b'), deviceOf('c'), deviceOf('d'), deviceOf('e'), deviceOf('f'), deviceOf('web-device', 'web')]
    expect(await guardedSender(sender, 0).send({ title: 'x' }, devices)).toEqual([
      { id: 'a', result: 'ok' },
      { id: 'b', result: 'retry' },
      { id: 'c', result: 'retry' },
      { id: 'd', result: 'gone', retryAfterSeconds: 10 },
      { id: 'e', result: 'retry' },
      { id: 'f', result: 'refused' },
    ])
  })

  it('counts every device as retry when the sender answers no list', async () => {
    const { sender } = recording(() => 'ok')
    expect(await guardedSender(sender, 0).send({ title: 'x' }, [deviceOf('a')])).toEqual([{ id: 'a', result: 'retry' }])
  })

  it('gives the sender only the devices of its kinds, and frozen copies of them and of the message', async () => {
    const { sender, calls } = recording(() => [])
    const message = { title: 'x', data: { a: { b: 1 } } }
    const devices = [deviceOf('a'), deviceOf('w', 'web')]
    await guardedSender(sender, 0).send(message, devices)
    expect(calls[0]!.devices.map((device) => device.id)).toEqual(['a'])
    expect(calls[0]!.devices[0]).not.toBe(devices[0])
    expect(Object.isFrozen(calls[0]!.devices[0])).toBe(true)
    expect(calls[0]!.message).not.toBe(message)
    expect(Object.isFrozen((calls[0]!.message.data as { a: object }).a)).toBe(true)
  })

  it('calls no sender for a batch without devices of its kinds', async () => {
    const { sender, calls } = recording(() => [])
    expect(await guardedSender(sender, 0).send({ title: 'x' }, [deviceOf('w', 'web')])).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('refuses a message before the sender sees it', async () => {
    const { sender, calls } = recording(() => [])
    await expect(guardedSender(sender, 0).send({ title: 'x', url: 'javascript:alert(1)' }, [deviceOf('a')])).rejects.toBeInstanceOf(PushMessageError)
    expect(calls).toHaveLength(0)
  })

  it('replaces what a sender throws with an error naming its index', async () => {
    const sender: PushSender = {
      kinds: ['fcm'],
      send: async () => {
        throw Object.assign(new Error('failed for https://fcm.googleapis.com/secret-endpoint'), { token: 'secret-token' })
      },
    }
    const thrown = (await guardedSender(sender, 2).send({ title: 'x' }, [deviceOf('a')]).catch((error: unknown) => error)) as Error
    expect(thrown).toBeInstanceOf(PushSenderError)
    expect(thrown.message).toBe('notifications sender 2 failed')
    expect(JSON.stringify({ ...thrown, cause: thrown.cause })).not.toContain('secret')
  })
})
