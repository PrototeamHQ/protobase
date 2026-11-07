import { describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { mail } from '../../../../test-support/fake-gmail/mail'
import { fakeConnection } from '../../../../test-support/fake-gmail/trigger-context'
import { gmailApi } from './api'
import { readMessage } from './read-message'

const setup = () => {
  const gmail = fakeGmail()
  const api = gmailApi({ origin: gmail.origin, fetch: gmail.fetch, connection: fakeConnection('token-1'), signal: new AbortController().signal })
  const read = (raw: string | Uint8Array) => {
    const [id] = gmail.deliver([raw])
    return readMessage(api, { id: id!, threadId: id! })
  }
  return { gmail, read }
}

// An RFC 2047 encoded word, which lets a header carry characters a raw header line cannot, such as CR, LF and NUL.
const encoded = (text: string) => `=?utf-8?B?${Buffer.from(text).toString('base64')}?=`

describe('readMessage', () => {
  it('gives hostile content as plain strings, interpreting none of it', async () => {
    const { gmail, read } = setup()
    const item = await read(
      mail({
        from: `${encoded('<img src=x onerror=alert(1)>\r\nX-Injected: yes')} <ada@example.com>`,
        subject: encoded('Hi\r\nBcc: victim@example.com\u0000\u0007<script>alert(1)</script>'),
        text: 'body <script>alert(1)</script>\r\n\u0000\u001b[31m',
        html: '<script>steal()</script>',
        attachments: [{ filename: '../../etc/passwd', content: 'root:x:0:0' }],
      }),
    )
    // Line breaks inside a header are folded into a space as MIME unfolds headers, so none starts a header of its own;
    // control characters and markup come through as they are.
    expect(item).toMatchObject({
      from: { name: '<img src=x onerror=alert(1)> X-Injected: yes', address: 'ada@example.com' },
      to: [{ name: 'Grace', address: 'grace@example.com' }],
      cc: [],
      subject: 'Hi Bcc: victim@example.com\u0000\u0007<script>alert(1)</script>',
      text: 'body <script>alert(1)</script>\n\u0000\u001b[31m',
      html: '<script>steal()</script>',
      attachments: [{ filename: '../../etc/passwd', content_type: 'application/octet-stream', size: 10 }],
    })
    // One read of the raw message, and nothing the content names was asked for.
    expect(gmail.calls.map(({ path }) => path)).toEqual([expect.stringMatching(/^messages\/[0-9a-f]+$/)])
  })

  it('reads a mail over 10 MiB from its headers alone, with no body and no attachments', async () => {
    const { gmail, read } = setup()
    const item = await read(mail({ subject: 'Huge', attachments: [{ filename: 'big.bin', content: 'x'.repeat(9 * 1024 * 1024) }] }))
    expect(item).toMatchObject({ from: { name: 'Ada', address: 'ada@example.com' }, to: [{ name: 'Grace', address: 'grace@example.com' }], subject: 'Huge', text: null, html: null, attachments: null, truncated: true })
    expect(gmail.calls.map(({ query }) => query.get('format'))).toEqual(['raw', 'metadata'])
  })

  it('gives nothing for a mail deleted since it was listed', async () => {
    const { gmail } = setup()
    const api = gmailApi({ origin: gmail.origin, fetch: gmail.fetch, connection: fakeConnection('token-1'), signal: new AbortController().signal })
    expect(await readMessage(api, { id: 'deadbeef', threadId: 'deadbeef' })).toBeUndefined()
  })
})
