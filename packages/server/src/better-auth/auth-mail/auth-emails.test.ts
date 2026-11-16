import { describe, expect, it } from 'vitest'
import { accountExistsEmail, appInvitationEmail, changeEmailCodeEmail, confirmationCodeEmail, invitationEmail, noAccountEmail, passwordChangedEmail, resetPasswordEmail, signInCodeEmail, signUpCodeEmail, staffSignInEmail, twoFactorCodeEmail } from './auth-emails'

const app = { name: 'Property Finder', url: 'https://homes.example.com/' }
const expiresAt = 'October 15, 2026 at 12:00 PM UTC'

// The text part's lines, without the blank ones.
const lines = (text: string) => text.split('\n').filter((line) => line.trim() !== '')

describe('the auth emails', () => {
  it('name the app in the subject, the body and the footer, which links its home page', async () => {
    const emails = [
      await signUpCodeEmail.render({ code: '123456', minutes: 10 }, { app }),
      await accountExistsEmail.render({}, { app }),
      await noAccountEmail.render({}, { app }),
      await passwordChangedEmail.render({}, { app }),
      await signInCodeEmail.render({ code: '123456', minutes: 10 }, { app }),
      await twoFactorCodeEmail.render({ code: '123456', minutes: 10 }, { app }),
      await changeEmailCodeEmail.render({ code: '123456', minutes: 10 }, { app }),
      await confirmationCodeEmail.render({ code: '123456', minutes: 10 }, { app }),
      await resetPasswordEmail.render({ url: 'https://homes.example.com/api/auth/reset-password/abc', hours: 1 }, { app }),
      await staffSignInEmail.render({ staff: 'Alex (alex@operator.example)', reason: 'Ticket 12', expiresAt }, { app }),
      await invitationEmail.render({ inviter: 'Ada', organization: 'Acme', url: 'https://homes.example.com/-/invitation?token=t', expiresAt }, { app }),
      await appInvitationEmail.render({ inviter: 'Ada', url: 'https://homes.example.com/-/invitation?token=t', expiresAt }, { app }),
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
    const email = await signUpCodeEmail.render({ code: '123456', minutes: 10 }, { app })
    expect(lines(email.text)).toContain('123456')
    expect(email.text).toContain('It works for 10 minutes, once.')
    expect((await signUpCodeEmail.render({ code: '123456', minutes: 1 }, { app })).text).toContain('It works for 1 minute, once.')
    expect(lines((await twoFactorCodeEmail.render({ code: '654321', minutes: 10 }, { app })).text)).toContain('654321')
    const changeEmail = await changeEmailCodeEmail.render({ code: '654321', minutes: 10 }, { app })
    expect(lines(changeEmail.text)).toContain('654321')
    expect(changeEmail.text).toContain('nobody can move an account to your address without the code')
  })

  it('start the subject with the code, so a mail client shows it and threads no two codes together', async () => {
    const subjects = [
      (await signInCodeEmail.render({ code: '654321', minutes: 10 }, { app })).subject,
      (await signUpCodeEmail.render({ code: '654321', minutes: 10 }, { app })).subject,
      (await twoFactorCodeEmail.render({ code: '654321', minutes: 10 }, { app })).subject,
      (await changeEmailCodeEmail.render({ code: '654321', minutes: 10 }, { app })).subject,
      (await confirmationCodeEmail.render({ code: '654321', minutes: 10 }, { app })).subject,
    ]
    expect(subjects).toEqual([
      '654321 is your Property Finder sign-in code',
      '654321 is your code to create an account with Property Finder',
      '654321 is your Property Finder verification code',
      '654321 confirms your new Property Finder address',
      "654321 confirms it's you in Property Finder",
    ])
    expect((await signInCodeEmail.render({ code: '123456', minutes: 10 }, { app })).subject).not.toBe(subjects[0])
  })

  it('send an address that has an account to the sign-in page, with no code', async () => {
    const email = await accountExistsEmail.render({}, { app })
    expect(email.subject).toBe('You already have an account with Property Finder')
    expect(email.html).toContain('href="https://homes.example.com/-/sign-in"')
    expect(email.text).toContain('Sign in to Property Finder https://homes.example.com/-/sign-in')
    expect(email.text).not.toMatch(/\d{6}/)
  })

  it('tell an address no account uses to sign in with the one signed up with, with no code', async () => {
    const email = await noAccountEmail.render({}, { app })
    expect(email.subject).toBe('No Property Finder account uses this address')
    expect(email.text).toContain('No account uses it, so no code was sent.')
    expect(email.text).toContain('sign in again with the address you signed up with')
    expect(email.text).toContain('Sign in to Property Finder https://homes.example.com/-/sign-in')
    expect(email.text).not.toMatch(/\d{6}/)
  })

  it('give the reset link whole, as the button and in the text part', async () => {
    const url = 'https://homes.example.com/api/auth/reset-password/abc?callbackURL=%2F-%2Fsign-in'
    const email = await resetPasswordEmail.render({ url, hours: 1 }, { app })
    expect(email.subject).toBe('Reset your Property Finder password')
    expect(email.html).toContain(`href="${url.replaceAll('&', '&amp;')}"`)
    expect(/https:\/\/\S+/.exec(email.text)![0]).toBe(url)
    expect(email.text).toContain('The link works for 1 hour, once.')
    expect(email.text).toContain('If you did not ask for this, ignore this email')
  })

  it('tell who signed in as the person, why, and until when', async () => {
    const email = await staffSignInEmail.render({ staff: 'Alex (alex@operator.example)', reason: 'Ticket 12: <b>cannot</b> save', expiresAt }, { app })
    expect(email.text).toContain('Alex (alex@operator.example), of the team that runs Property Finder, signed in as you to help.')
    expect(email.text).toContain('Ticket 12: <b>cannot</b> save')
    expect(email.html).not.toContain('<b>cannot</b>')
    expect(email.text).toContain(`Their session ends by ${expiresAt}.`)
  })

  it('invite with the inviter, the organization and the link', async () => {
    const email = await invitationEmail.render({ inviter: 'Ada', organization: 'Acme', url: 'https://homes.example.com/-/invitation?token=t', expiresAt }, { app })
    expect(email.subject).toBe('Join Acme on Property Finder')
    expect(email.text).toContain('Ada invites you to join Acme on Property Finder.')
    expect(/https:\/\/\S+/.exec(email.text)![0]).toBe('https://homes.example.com/-/invitation?token=t')
  })

  it('invite to the app itself without an organization', async () => {
    const email = await appInvitationEmail.render({ inviter: 'Ada', url: 'https://homes.example.com/-/invitation?token=t', expiresAt }, { app })
    expect(email.subject).toBe('Join Property Finder')
    expect(email.text).toContain('Ada invites you to join Property Finder.')
  })

  it('tell an account its password changed, with the way to choose a new one when it was not them', async () => {
    const email = await passwordChangedEmail.render({}, { app })
    expect(email.subject).toBe('Your Property Finder password was changed')
    expect(email.text).toContain('The password of your account with Property Finder was just changed.')
    expect(email.html).toContain('href="https://homes.example.com/-/sign-in?step=forgot-password"')
  })

  it('come in Dutch for a Dutch reader, every text and the code mails\' lifetimes too', async () => {
    const reset = await resetPasswordEmail.render({ url: 'https://homes.example.com/api/auth/reset-password/abc', hours: 1 }, { app, locale: 'nl-NL' })
    expect(reset.locale).toBe('nl')
    expect(reset.subject).toBe('Stel je wachtwoord voor Property Finder opnieuw in')
    expect(reset.html).toMatch(/<html dir="ltr" lang="nl"/)
    expect(reset.html).toContain('Kies een nieuw wachtwoord voor Property Finder')
    expect(reset.text).toContain('Kies een nieuw wachtwoord https://homes.example.com/api/auth/reset-password/abc')
    expect(reset.text).toContain('De link is 1 uur geldig en werkt één keer.')
    const code = await signInCodeEmail.render({ code: '654321', minutes: 10 }, { app, locale: 'nl' })
    expect(code.subject).toBe('654321 is je inlogcode voor Property Finder')
    expect(lines(code.text)).toContain('654321')
    expect(code.text).toContain('De code is 10 minuten geldig en werkt één keer.')
    expect((await noAccountEmail.render({}, { app, locale: 'nl' })).text).toContain('Inloggen bij Property Finder https://homes.example.com/-/sign-in')
  })

  it('come in English for any other language, every one in both', async () => {
    expect((await resetPasswordEmail.render({ url: 'https://homes.example.com/r', hours: 1 }, { app, locale: 'de' })).subject).toBe('Reset your Property Finder password')
    for (const template of [accountExistsEmail, appInvitationEmail, changeEmailCodeEmail, confirmationCodeEmail, invitationEmail, noAccountEmail, passwordChangedEmail, resetPasswordEmail, signInCodeEmail, signUpCodeEmail, staffSignInEmail, twoFactorCodeEmail]) {
      expect(template.languages).toEqual(['en', 'nl'])
    }
  })
})
