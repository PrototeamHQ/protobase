import { describe, expect, it, vi } from 'vitest'
import { verifyStandardWebhook } from '../functions/verify-signature'
import { issued, json, notReceived, receivedFrom, token } from './mail-check-responses'
import { mailCheckService } from './mail-check-service'
import { mailCheckSecret } from './mail-check-signing'

const settings = { url: 'https://checks.example/apps/7/mail-checks', platformSecret: 'platform' }

const answering = (...responses: Response[]) => {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => responses.shift()!)
  return { fetcher, service: mailCheckService(settings, fetcher as typeof fetch) }
}

const sent = async (fetcher: ReturnType<typeof answering>['fetcher'], call = 0) => {
  const [url, init] = fetcher.mock.calls[call]!
  return { url, body: await verifyStandardWebhook(new Request(String(url), init), { secret: mailCheckSecret('platform') }) }
}

describe('the mail check service', () => {
  it('issues a one-time address with a signed POST under the URL the platform names', async () => {
    const { fetcher, service } = answering(json(issued, 201))
    expect(await service.issue()).toEqual(issued)
    expect(await sent(fetcher)).toEqual({ url: 'https://checks.example/apps/7/mail-checks/alias-checks', body: '{}' })
  })

  it("answers the From address a token's message arrived with, or nothing before it arrived", async () => {
    const { fetcher, service } = answering(json(notReceived), json(receivedFrom('ana@gmail.example')))
    expect(await service.received(token)).toBeUndefined()
    expect(await service.received(token)).toBe('ana@gmail.example')
    expect(await sent(fetcher, 1)).toEqual({ url: 'https://checks.example/apps/7/mail-checks/alias-checks/result', body: JSON.stringify({ token }) })
  })

  it('fails on a refusal or an answer of another shape', async () => {
    await expect(answering(json({ error: 'unauthorized' }, 401)).service.issue()).rejects.toThrow(/answered 401 .*alias-checks$/)
    await expect(answering(json({ token })).service.issue()).rejects.toThrow()
    await expect(answering(json({ received: true })).service.received(token)).rejects.toThrow()
  })
})
