import { describe, expect, it } from 'vitest'
import type { MailMessage } from '../../mail/smtp-mailer'
import { sendAuthEmail } from './send-auth-email'

const recording = () => {
  const sent: MailMessage[] = []
  return { sent, mail: { mailer: { send: async (message: MailMessage) => void sent.push(message) }, appName: 'Property Finder', baseURL: 'https://homes.example.com' } }
}

describe('sendAuthEmail', () => {
  it('sends both parts, naming the app and linking it on the origin the request came to', async () => {
    const { sent, mail } = recording()
    await sendAuthEmail(mail, 'accountExistsEmail', 'ada@example.com', {}, 'https://admin.homes.example.com/api/auth')
    expect(sent).toEqual([{ to: 'ada@example.com', subject: 'You already have an account with Property Finder', html: expect.stringContaining('https://admin.homes.example.com/-/sign-in'), text: expect.stringContaining('https://admin.homes.example.com/-/sign-in') }])
  })

  it('links the app on its base URL outside a request', async () => {
    const { sent, mail } = recording()
    await sendAuthEmail(mail, 'signInCodeEmail', 'ada@example.com', { code: '123456', lifetime: '5 minutes' })
    expect(sent[0]!.text).toContain('Property Finder https://homes.example.com/')
  })
})
