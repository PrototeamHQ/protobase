import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineEmail } from './define-email'
import type { MailMessage } from './smtp-mailer'

type Welcome = { name: string; url: string }

const Body = ({ name, url }: Welcome) => createElement('div', null, createElement('p', null, `Hi ${name},`), createElement('a', { href: url }, 'Open the app'))

const welcome = defineEmail({ name: 'welcome', subject: ({ name }: Welcome) => `Welcome, ${name}`, component: Body })

const recording = () => {
  const sent: MailMessage[] = []
  return { sent, mailer: { send: async (message: MailMessage) => void sent.push(message) } }
}

describe('defineEmail', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('renders the subject, the HTML and a plain-text part from the data', async () => {
    const email = await welcome.render({ name: 'Ada', url: 'https://app.example.com' })
    expect(email.subject).toBe('Welcome, Ada')
    expect(email.html).toMatch(/^<!DOCTYPE html/)
    expect(email.html).toContain('<p>Hi Ada,</p><a href="https://app.example.com">Open the app</a>')
    expect(email.text).toBe('Hi Ada,\n\nOpen the app https://app.example.com')
  })

  it('takes a fixed subject', async () => {
    const plain = defineEmail({ name: 'plain', subject: 'Hello', component: Body })
    expect((await plain.render({ name: 'Ada', url: 'https://app.example.com' })).subject).toBe('Hello')
  })

  it('sends both parts through the mailer it is given', async () => {
    const { sent, mailer } = recording()
    await welcome.send('ada@example.com', { name: 'Ada', url: 'https://app.example.com' }, mailer)
    expect(sent).toEqual([{ to: 'ada@example.com', subject: 'Welcome, Ada', html: expect.stringContaining('Hi Ada,'), text: expect.stringContaining('Hi Ada,') }])
  })

  it('sends the header fields it makes from the data', async () => {
    const { sent, mailer } = recording()
    const digest = defineEmail({
      name: 'digest',
      subject: 'Your digest',
      component: Body,
      headers: ({ url }: Welcome) => ({ 'List-Unsubscribe': `<${url}/unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }),
    })
    await digest.send('ada@example.com', { name: 'Ada', url: 'https://app.example.com' }, mailer)
    expect(sent[0]!.headers).toEqual({ 'List-Unsubscribe': '<https://app.example.com/unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
  })

  it('refuses to send while mail is off', async () => {
    vi.stubEnv('PROTOBASE_SMTP_URL', '')
    vi.stubEnv('PROTOBASE_MAIL_FROM', '')
    await expect(welcome.send('ada@example.com', { name: 'Ada', url: 'https://app.example.com' })).rejects.toThrow(
      'Email "welcome" cannot be sent: mail is off; set PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM',
    )
  })
})
