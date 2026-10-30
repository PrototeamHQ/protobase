import { describe, expect, it, vi } from 'vitest'
import { gmail, gmailSendUrl } from './gmail'
import { insufficientScope, invalidCredentials, json, sentMessage } from './gmail-responses'
import { PersonalMailError } from './personal-mail-error'

const pdf = new TextEncoder().encode('%PDF-1.7 invoice 7')
const invoice = { to: 'ada@example.com', subject: 'Invoice 7', text: 'Your invoice is attached.', html: '<p>Your invoice is attached.</p>', attachments: [{ filename: 'invoice-7.pdf', content: pdf, contentType: 'application/pdf' }] }

const answering = (response: () => Response) => {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response())
  return { fetcher, provider: gmail(fetcher as typeof fetch) }
}

describe('gmail', () => {
  it('uploads the message as RFC 5322 with its attachment, with the access token', async () => {
    const { fetcher, provider } = answering(() => json(sentMessage))
    await provider.send(invoice, 'access-1')

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(gmailSendUrl)
    expect(init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer access-1', 'content-type': 'message/rfc822' } })
    const raw = new TextDecoder().decode(init!.body as Uint8Array).replace(/\r\n/g, '\n')
    expect(raw).toMatch(/^To: ada@example\.com$/m)
    expect(raw).toMatch(/^Subject: Invoice 7$/m)
    // Gmail fills in the From header with the linked address.
    expect(raw).not.toMatch(/^From:/m)
    expect(raw).toMatch(/^Content-Type: multipart\/mixed;/m)
    expect(raw).toMatch(/^Content-Type: multipart\/alternative;/m)
    expect(raw).toMatch(/^Content-Type: application\/pdf; name=invoice-7\.pdf$/m)
    expect(raw).toMatch(/^Content-Disposition: attachment; filename=invoice-7\.pdf$/m)
    expect(raw).toContain(Buffer.from(pdf).toString('base64'))
  })

  it('is link_expired when Gmail refuses the token', async () => {
    const { provider } = answering(() => json(invalidCredentials, 401))
    await expect(provider.send(invoice, 'revoked')).rejects.toEqual(new PersonalMailError('link_expired', 'gmail'))
  })

  it('is link_expired when the grant to send was taken back', async () => {
    const { provider } = answering(() => json(insufficientScope, 403))
    await expect(provider.send(invoice, 'no-scope')).rejects.toMatchObject({ code: 'link_expired', provider: 'gmail', status: 409 })
  })

  it('names the status of any other refusal', async () => {
    const { provider } = answering(() => new Response('Backend Error', { status: 503, statusText: 'Service Unavailable' }))
    await expect(provider.send(invoice, 'access-1')).rejects.toThrow('Gmail refused the message: 503 Service Unavailable')
  })

  it('refuses a header value that would start another header, sending nothing', async () => {
    const { fetcher, provider } = answering(() => json(sentMessage))
    await expect(provider.send({ ...invoice, headers: { 'X-Note': 'a\r\nBcc: eve@example.com' } }, 'access-1')).rejects.toThrow('Mail header X-Note has a line break')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
