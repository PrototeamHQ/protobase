import { emailCodeMinutes } from '@protobase/schema/internal'
import { describe, expect, it } from 'vitest'
import type { MailMessage } from '../mail/smtp-mailer'
import { emailCodeOptions, twoFactorCodeOptions } from './sign-in-mail'

const recording = () => {
  const sent: MailMessage[] = []
  return { sent, mail: { mailer: { send: async (message: MailMessage) => void sent.push(message) }, appName: 'Property Finder', baseURL: 'https://homes.example.com' } }
}

describe('emailed sign-in and two-factor codes', () => {
  it('work for 10 minutes, since a code may wait in a spam folder', () => {
    expect(emailCodeMinutes).toBe(10)
  })

  it('expire by the shared lifetime, the one the email and the page state', async () => {
    const { sent, mail } = recording()
    const signIn = emailCodeOptions(mail)
    const twoFactor = twoFactorCodeOptions(mail)
    expect([signIn.expiresIn, twoFactor.period]).toEqual([emailCodeMinutes * 60, emailCodeMinutes])
    await signIn.sendVerificationOTP({ email: 'ada@example.com', otp: '123456', type: 'sign-in' }, undefined)
    await twoFactor.sendOTP({ user: { email: 'ada@example.com' } as never, otp: '654321' }, undefined)
    expect(sent).toHaveLength(2)
    for (const message of sent) {
      expect(message.text).toContain(`It works for ${emailCodeMinutes} minutes, once.`)
      expect(message.html).toContain(`>${emailCodeMinutes} minutes<`)
    }
  })
})
