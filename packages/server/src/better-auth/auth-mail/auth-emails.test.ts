import { describe, expect, it } from 'vitest'
import { accountExistsEmail, changeEmailCodeEmail, invitationEmail, noAccountEmail, resetPasswordEmail, signInCodeEmail, signUpCodeEmail, staffSignInEmail, twoFactorCodeEmail } from './auth-emails'

const app = { name: 'Property Finder', url: 'https://homes.example.com/' }
const expiresAt = new Date('2026-10-15T12:00:00Z')

// The text part's lines, without the blank ones.
const lines = (text: string) => text.split('\n').filter((line) => line.trim() !== '')

describe('the auth emails', () => {
  it('name the app in the subject, the body and the footer, which links its home page', async () => {
    const emails = [
      await signUpCodeEmail.render({ app, code: '123456', lifetime: '10 minutes' }),
      await accountExistsEmail.render({ app }),
      await noAccountEmail.render({ app }),
      await signInCodeEmail.render({ app, code: '123456', lifetime: '10 minutes' }),
      await twoFactorCodeEmail.render({ app, code: '123456', lifetime: '10 minutes' }),
      await changeEmailCodeEmail.render({ app, code: '123456', lifetime: '10 minutes' }),
      await resetPasswordEmail.render({ app, url: 'https://homes.example.com/api/auth/reset-password/abc', lifetime: '1 hour' }),
      await staffSignInEmail.render({ app, staff: 'Alex (alex@operator.example)', reason: 'Ticket 12', expiresAt }),
      await invitationEmail.render({ app, inviter: 'Ada', organization: 'Acme', url: 'https://homes.example.com/-/invitation?token=t', expiresAt }),
    ]
    for (const email of emails) {
      expect(email.subject).toContain('Property Finder')
      expect(email.html).toMatch(/^<!DOCTYPE html/)
      expect(email.html).toContain('<a href="https://homes.example.com/"')
      expect(lines(email.text).at(-1)).toBe('Property Finder https://homes.example.com/')
      expect(lines(email.text).filter((line) => line.includes('Property Finder')).length).toBeGreaterThan(1)
    }
  })

  it('put a code on a line of its own, with how long it works', async () => {
    const email = await signUpCodeEmail.render({ app, code: '123456', lifetime: '10 minutes' })
    expect(lines(email.text)).toContain('123456')
    expect(email.text).toContain('It works for 10 minutes, once.')
    expect(lines((await twoFactorCodeEmail.render({ app, code: '654321', lifetime: '10 minutes' })).text)).toContain('654321')
    const changeEmail = await changeEmailCodeEmail.render({ app, code: '654321', lifetime: '10 minutes' })
    expect(lines(changeEmail.text)).toContain('654321')
    expect(changeEmail.text).toContain('nobody can move an account to your address without the code')
  })

  it('start the subject with the code, so a mail client shows it and threads no two codes together', async () => {
    const subjects = [
      (await signInCodeEmail.render({ app, code: '654321', lifetime: '10 minutes' })).subject,
      (await signUpCodeEmail.render({ app, code: '654321', lifetime: '10 minutes' })).subject,
      (await twoFactorCodeEmail.render({ app, code: '654321', lifetime: '10 minutes' })).subject,
      (await changeEmailCodeEmail.render({ app, code: '654321', lifetime: '10 minutes' })).subject,
    ]
    expect(subjects).toEqual([
      '654321 is your Property Finder sign-in code',
      '654321 is your code to create an account with Property Finder',
      '654321 is your Property Finder verification code',
      '654321 confirms your new Property Finder address',
    ])
    expect((await signInCodeEmail.render({ app, code: '123456', lifetime: '10 minutes' })).subject).not.toBe(subjects[0])
  })

  it('send an address that has an account to the sign-in page, with no code', async () => {
    const email = await accountExistsEmail.render({ app })
    expect(email.subject).toBe('You already have an account with Property Finder')
    expect(email.html).toContain('href="https://homes.example.com/-/sign-in"')
    expect(email.text).toContain('Sign in to Property Finder https://homes.example.com/-/sign-in')
    expect(email.text).not.toMatch(/\d{6}/)
  })

  it('tell an address no account uses to sign in with the one signed up with, with no code', async () => {
    const email = await noAccountEmail.render({ app })
    expect(email.subject).toBe('No Property Finder account uses this address')
    expect(email.text).toContain('No account uses it, so no code was sent.')
    expect(email.text).toContain('sign in again with the address you signed up with')
    expect(email.text).toContain('Sign in to Property Finder https://homes.example.com/-/sign-in')
    expect(email.text).not.toMatch(/\d{6}/)
  })

  it('give the reset link whole, as the button and in the text part', async () => {
    const url = 'https://homes.example.com/api/auth/reset-password/abc?callbackURL=%2F-%2Fsign-in'
    const email = await resetPasswordEmail.render({ app, url, lifetime: '1 hour' })
    expect(email.subject).toBe('Reset your Property Finder password')
    expect(email.html).toContain(`href="${url.replaceAll('&', '&amp;')}"`)
    expect(/https:\/\/\S+/.exec(email.text)![0]).toBe(url)
    expect(email.text).toContain('The link works for 1 hour, once.')
    expect(email.text).toContain('If you did not ask for this, ignore this email')
  })

  it('tell who signed in as the person, why, and until when', async () => {
    const email = await staffSignInEmail.render({ app, staff: 'Alex (alex@operator.example)', reason: 'Ticket 12: <b>cannot</b> save', expiresAt })
    expect(email.text).toContain('Alex (alex@operator.example), of the team that runs Property Finder, signed in as you to help.')
    expect(email.text).toContain('Ticket 12: <b>cannot</b> save')
    expect(email.html).not.toContain('<b>cannot</b>')
    expect(email.text).toContain(expiresAt.toUTCString())
  })

  it('invite with the inviter, the organization and the link', async () => {
    const email = await invitationEmail.render({ app, inviter: 'Ada', organization: 'Acme', url: 'https://homes.example.com/-/invitation?token=t', expiresAt })
    expect(email.subject).toBe('Join Acme on Property Finder')
    expect(email.text).toContain('Ada invites you to join Acme on Property Finder.')
    expect(/https:\/\/\S+/.exec(email.text)![0]).toBe('https://homes.example.com/-/invitation?token=t')
  })

  it('invite to the app itself without an organization', async () => {
    const email = await invitationEmail.render({ app, inviter: 'Ada', url: 'https://homes.example.com/-/invitation?token=t', expiresAt })
    expect(email.subject).toBe('Join Property Finder')
    expect(email.text).toContain('Ada invites you to join Property Finder.')
  })
})
