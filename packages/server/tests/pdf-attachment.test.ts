import { createElement as h } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pdfText } from '../../../test-support/pdf-text'
import { defineEmail, definePdf } from '../src/index'
import { smtpMailer } from '../src/mail/smtp-mailer'
import { Document, Page, Text } from '../src/pdf'
import { startFakeRelay } from './support/fake-relay'

type Receipt = { number: string; total: string }

const receiptPdf = definePdf({
  name: 'receipt',
  component: ({ number, total }: Receipt) => h(Document, null, h(Page, null, h(Text, null, `Receipt ${number}`), h(Text, null, `Total ${total}`))),
})
const receiptEmail = defineEmail({ name: 'receipt', subject: ({ number }: Receipt) => `Receipt ${number}`, component: ({ number }: Receipt) => h('p', null, `Receipt ${number} is attached.`) })

// The bytes of the message's part of `contentType`, from its base64 body.
const partBytes = (raw: string, contentType: string) => {
  const start = raw.indexOf(`Content-Type: ${contentType}`)
  const body = raw.indexOf('\r\n\r\n', start) + 4
  return new Uint8Array(Buffer.from(raw.slice(body, raw.indexOf('\r\n--', body)), 'base64'))
}

describe('a PDF document as an email attachment', () => {
  let relay: Awaited<ReturnType<typeof startFakeRelay>>
  beforeAll(async () => void (relay = await startFakeRelay()))
  afterAll(() => relay.close())

  it('arrives over SMTP as the PDF file it rendered', async () => {
    const data = { number: 'R-7', total: '€ 24.50' }
    const pdf = await receiptPdf.render(data)
    const mailer = smtpMailer({ smtpUrl: relay.smtpUrl, from: 'noreply@shop.example.com' })
    await receiptEmail.send('ada@example.com', data, mailer, { attachments: [{ filename: 'receipt-R-7.pdf', content: pdf, contentType: 'application/pdf' }] })

    const { raw } = await relay.next()
    expect(raw).toContain('Content-Disposition: attachment; filename=receipt-R-7.pdf')
    const attached = partBytes(raw, 'application/pdf')
    expect(attached).toEqual(pdf)
    expect(pdfText(attached)).toBe('Receipt R-7Total \x80 24.50')
  })
})
