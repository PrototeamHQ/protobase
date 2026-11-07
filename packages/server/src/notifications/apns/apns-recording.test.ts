import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { apnsService, apnsTestDevice, apnsTestEnv } from '../testing/apns-service'
import { apnsSender } from './apns-sender'
import { readApnsSettings } from './apns-settings'

// APNs's sandbox answers, recorded by `bun run record:apns` (scripts/apns-recording/) with a token of no device.
const dir = new URL('./snapshots/', import.meta.url)
const recordings = readdirSync(dir).filter((file) => file.endsWith('.json')).map((file) => [file, JSON.parse(readFileSync(new URL(file, dir), 'utf8'))] as const)

const settings = readApnsSettings(apnsTestEnv())!
const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

describe('the APNs sender against recorded APNs answers', () => {
  it('has recordings', () => {
    expect(recordings.map(([file]) => file)).toContain('provider-token.json')
  })

  it.each(recordings)('%s: sends the request recorded and answers as recorded', async (_, recording) => {
    const reason = JSON.parse(recording.response.body || '{}').reason
    const service = await apnsService(() => ({ status: recording.response.status, ...(reason !== undefined && { reason }) }))
    closers.push(service.close)
    const sender = apnsSender(settings, { appId: recording.topic, connect: service.connect, now: () => recording.nowSeconds * 1000 })
    const device = apnsTestDevice({ ...recording.device, appId: recording.topic })
    const answers = await sender.send(recording.message, [device])
    expect(answers.map(({ result }) => ({ result }))).toEqual(recording.answers)
    const [request] = service.requests
    expect(request!.origin).toBe(recording.request.origin)
    expect(Object.fromEntries(Object.keys(recording.request.headers).map((name) => [name, request!.headers[name]]))).toEqual(recording.request.headers)
    expect(request!.body).toBe(recording.request.body)
  })
})
