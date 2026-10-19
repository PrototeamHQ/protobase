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

  it('sends an HTML part beside the plain text', async () => {
    const mailer = smtpMailer({ smtpUrl: 'smtp://relay.example.net:587', from: 'noreply@acme.example.com' })
    await mailer.send({ to: 'ada@example.com', subject: 'Welcome', text: 'Hello', html: '<p>Hello</p>' })
    expect(sendMail).toHaveBeenLastCalledWith({ from: 'noreply@acme.example.com', to: 'ada@example.com', subject: 'Welcome', text: 'Hello', html: '<p>Hello</p>' })
  })

  it('shows the name, when it has one, as the sender display name', async () => {
    const mailer = smtpMailer({ smtpUrl: 'smtp://relay.example.net:587', from: 'noreply@shop.example.com', name: 'Shop "North"' })
    await mailer.send({ to: 'ada@example.com', subject: 'Hello', text: 'Hello' })
    expect(sendMail).toHaveBeenLastCalledWith({ from: { name: 'Shop "North"', address: 'noreply@shop.example.com' }, to: 'ada@example.com', subject: 'Hello', text: 'Hello' })
  })

  it('sends header fields of the message, and refuses one that would break the header', async () => {
    const mailer = smtpMailer({ smtpUrl: 'smtp://relay.example.net:587', from: 'noreply@shop.example.com' })
    const headers = { 'List-Unsubscribe': '<https://shop.example.com/unsubscribe/7>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    await mailer.send({ to: 'ada@example.com', subject: 'Hello', text: 'Hello', headers })
    expect(sendMail).toHaveBeenLastCalledWith({ from: 'noreply@shop.example.com', to: 'ada@example.com', subject: 'Hello', text: 'Hello', headers })
    await expect(mailer.send({ to: 'ada@example.com', subject: 'Hello', text: 'Hello', headers: { 'X-Note': 'a\r\nBcc: eve@example.com' } })).rejects.toThrow('Mail header X-Note has a line break')
    await expect(mailer.send({ to: 'ada@example.com', subject: 'Hello', text: 'Hello', headers: { 'X Note': 'a' } })).rejects.toThrow('Mail header name "X Note" is not a valid header field name')
  })
})
