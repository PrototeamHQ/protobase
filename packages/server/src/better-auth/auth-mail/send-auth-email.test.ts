import { describe, expect, it } from 'vitest'
import type { MailMessage } from '../../mail/smtp-mailer'
import { sendAuthEmail } from './send-auth-email'

const recording = () => {
  const sent: MailMessage[] = []
  return { sent, mail: { mailer: { send: async (message: MailMessage) => { sent.push(message); return {} } }, appName: 'Property Finder', baseURL: 'https://homes.example.com' } }
}

describe('sendAuthEmail', () => {
  it('sends both parts, naming the app and linking it on the origin the request came to', async () => {
    const { sent, mail } = recording()
    await sendAuthEmail(mail, 'accountExistsEmail', 'ada@example.com', {}, 'https://admin.homes.example.com/api/auth')
    expect(sent).toEqual([{ to: 'ada@example.com', subject: 'You already have an account with Property Finder', html: expect.stringContaining('https://admin.homes.example.com/-/sign-in'), text: expect.stringContaining('https://admin.homes.example.com/-/sign-in') }])
  })

  it('links the app on its base URL outside a request', async () => {
    const { sent, mail } = recording()
    await sendAuthEmail(mail, 'signInCodeEmail', 'ada@example.com', { code: '123456', minutes: 10 })
    expect(sent[0]!.text).toContain('Property Finder https://homes.example.com/')
  })

  it("sends in the request's language, with a date written in it", async () => {
    const { sent, mail } = recording()
    const expiresAt = new Date('2026-10-15T12:00:00Z')
    await sendAuthEmail(mail, 'appInvitationEmail', 'ada@example.com', { inviter: 'Bo', url: 'https://homes.example.com/-/invitation?token=t', expiresAt }, undefined, 'nl')
    await sendAuthEmail(mail, 'appInvitationEmail', 'ada@example.com', { inviter: 'Bo', url: 'https://homes.example.com/-/invitation?token=t', expiresAt })
    expect(sent.map((message) => message.subject)).toEqual(['Word lid van Property Finder', 'Join Property Finder'])
    expect(sent[0]!.text).toContain('De link werkt tot 15 oktober 2026 om 12:00 UTC.')
    expect(sent[1]!.text).toContain('The link works until October 15, 2026 at 12:00 PM UTC.')
  })
})
