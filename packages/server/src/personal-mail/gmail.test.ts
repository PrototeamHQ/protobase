import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  // Nodemailer reads an attachment's `path` or `href`, and a `content` of `{ path }`, from disk or the network.
  it('reads no attachment from a file path or URL, sending only bytes it was given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gmail-attachment-'))
    const file = join(dir, 'secret.txt')
    await writeFile(file, 'server secret')
    const requests: string[] = []
    const server = createServer((request, response) => void (requests.push(request.url ?? ''), response.end('fetched secret')))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/secret`
    try {
      const { fetcher, provider } = answering(() => json(sentMessage))
      const named = { filename: 'named.txt', content: new Uint8Array([104, 105]), path: file, href: url } as never
      const asText = { filename: 'text.txt', content: url } as never
      await provider.send({ ...invoice, attachments: [named, asText] }, 'access-1')
      const raw = new TextDecoder().decode(fetcher.mock.calls[0]![1]!.body as Uint8Array)
      expect(raw).not.toContain(Buffer.from('server secret').toString('base64'))
      expect(raw).not.toContain(Buffer.from('fetched secret').toString('base64'))
      expect(raw).toContain(Buffer.from('hi').toString('base64'))

      const read = answering(() => json(sentMessage))
      await expect(read.provider.send({ ...invoice, attachments: [{ filename: 'secret.txt', content: { path: file } } as never] }, 'access-1')).rejects.toThrow(TypeError)
      expect(read.fetcher).not.toHaveBeenCalled()
      expect(requests).toEqual([])
    } finally {
      server.close()
      await rm(dir, { recursive: true })
    }
  })
})
