import { describe, expect, it, vi } from 'vitest'
import { smtpMailer } from './smtp-mailer'

const sendMail = vi.fn(async () => ({}))
const createTransport = vi.fn(() => ({ sendMail }))
vi.mock('nodemailer', () => ({ createTransport }))

describe('smtpMailer', () => {
  it('greets the server with the sender domain and sends from the sender', async () => {
    const smtpUrl = 'smtps://tenant:s3cret@relay.example.net:465'
    const mailer = smtpMailer({ smtpUrl, from: 'noreply@erp.acme.example.com' })
    await mailer.send({ to: 'ada@example.com', subject: 'Reset', text: 'Hello' })
    await mailer.send({ to: 'bob@example.com', subject: 'Reset', text: 'Hello' })

    expect(createTransport).toHaveBeenCalledTimes(1)
    expect(createTransport).toHaveBeenCalledWith({ url: smtpUrl, name: 'erp.acme.example.com' })
    expect(sendMail).toHaveBeenCalledWith({ from: 'noreply@erp.acme.example.com', to: 'ada@example.com', subject: 'Reset', text: 'Hello' })
  })
})
