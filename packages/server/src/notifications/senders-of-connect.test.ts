import { connect } from 'node:http2'
import { describe, expect, it, vi } from 'vitest'
import { PushSenderError } from './guarded-sender'
import { notificationSenders } from './senders-of'
import { apnsTestDevice, apnsTestEnv } from './testing/apns-service'

// The built-in APNs sender opens its sessions through `node:http2` itself; here it fails at once, as no APNs is reached.
vi.mock('node:http2', async (original) => ({
  ...(await original<typeof import('node:http2')>()),
  connect: vi.fn(() => {
    throw new Error('no network in tests')
  }),
}))

describe('the built-in APNs sender', () => {
  it('opens its sessions with node:http2\'s own, verified connect, to the fixed origin alone', async () => {
    const [apns] = notificationSenders({}, apnsTestEnv(), { appId: 'net.example.app' })
    await expect(apns!.send({ title: 'Hi' }, [apnsTestDevice({ environment: 'production' })])).rejects.toThrow(PushSenderError)
    expect(vi.mocked(connect).mock.calls).toEqual([['https://api.push.apple.com']])
  })
})
