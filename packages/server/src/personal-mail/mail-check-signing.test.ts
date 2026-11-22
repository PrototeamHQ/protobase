import { describe, expect, it } from 'vitest'
import { verifyStandardWebhook } from '../functions/verify-signature'
import { mailFeedbackSecret } from '../mail/feedback/feedback-signing'
import { mailCheckHeaders, mailCheckSecret } from './mail-check-signing'

describe('the mail check signature', () => {
  it('signs a call so the service verifies it with the secret it derives from the same platform secret', async () => {
    const body = JSON.stringify({ token: 'abc' })
    const headers = await mailCheckHeaders('platform', 'call-1', body)
    const request = new Request('https://checks.example/alias-checks/result', { method: 'POST', headers, body })
    expect(await verifyStandardWebhook(request, { secret: mailCheckSecret('platform') })).toBe(body)
  })

  it("is the platform secret's own for checks, not the feedback endpoint's nor another app's", async () => {
    expect(mailCheckSecret('platform')).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    expect(mailCheckSecret('platform')).not.toBe(mailFeedbackSecret('platform'))
    const headers = await mailCheckHeaders('another', 'call-1', '{}')
    const request = new Request('https://checks.example/alias-checks', { method: 'POST', headers, body: '{}' })
    await expect(verifyStandardWebhook(request, { secret: mailCheckSecret('platform') })).rejects.toMatchObject({ status: 401 })
  })
})
