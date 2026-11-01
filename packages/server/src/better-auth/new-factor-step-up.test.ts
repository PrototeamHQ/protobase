import { describe, expect, it } from 'vitest'
import { emailCodeSignInRequired, newFactorRefusal, strongSignInRequired, type NewFactorFacts } from './new-factor-step-up'

const now = new Date('2026-08-01T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

const facts = (overrides: Partial<{ hasFactor: boolean; hasPassword: boolean; strongSignInAt: Date; emailCodeSignInAt: Date }> = {}): NewFactorFacts => ({
  hasFactor: async () => overrides.hasFactor ?? false,
  hasPassword: async () => overrides.hasPassword ?? false,
  strongSignInAt: async () => overrides.strongSignInAt,
  emailCodeSignInAt: async () => overrides.emailCodeSignInAt,
})

describe('newFactorRefusal', () => {
  it('lets other requests through', async () => {
    expect(await newFactorRefusal('/passkey/delete-passkey', facts(), now)).toBeUndefined()
  })

  it('refuses a passkey or new backup codes on an account with a factor without a recent strong sign-in', async () => {
    for (const path of ['/passkey/generate-register-options', '/passkey/verify-registration', '/two-factor/enable', '/two-factor/get-totp-uri', '/two-factor/generate-backup-codes']) {
      expect(await newFactorRefusal(path, facts({ hasFactor: true }), now)).toEqual(strongSignInRequired)
      expect(await newFactorRefusal(path, facts({ hasFactor: true, strongSignInAt: minutesAgo(16) }), now)).toEqual(strongSignInRequired)
    }
  })

  it('does not take an emailed code or a password for a strong sign-in on an account with a factor', async () => {
    const fresh = facts({ hasFactor: true, hasPassword: true, emailCodeSignInAt: minutesAgo(1) })
    expect(await newFactorRefusal('/passkey/generate-register-options', fresh, now)).toEqual(strongSignInRequired)
    expect(await newFactorRefusal('/two-factor/generate-backup-codes', fresh, now)).toEqual(strongSignInRequired)
  })

  it('lets an account with a factor add one within 15 minutes of a strong sign-in', async () => {
    expect(await newFactorRefusal('/passkey/generate-register-options', facts({ hasFactor: true, strongSignInAt: minutesAgo(15) }), now)).toBeUndefined()
  })

  it('lets an account without a factor add its first within 15 minutes of an emailed-code sign-in', async () => {
    expect(await newFactorRefusal('/passkey/generate-register-options', facts({ emailCodeSignInAt: minutesAgo(5) }), now)).toBeUndefined()
    expect(await newFactorRefusal('/two-factor/enable', facts({ emailCodeSignInAt: minutesAgo(5) }), now)).toBeUndefined()
  })

  it('refuses the first factor to a session without a recent emailed-code sign-in', async () => {
    expect(await newFactorRefusal('/passkey/generate-register-options', facts(), now)).toEqual(emailCodeSignInRequired)
    expect(await newFactorRefusal('/passkey/verify-registration', facts({ emailCodeSignInAt: minutesAgo(16) }), now)).toEqual(emailCodeSignInRequired)
    expect(await newFactorRefusal('/two-factor/enable', facts(), now)).toEqual(emailCodeSignInRequired)
  })

  it('leaves the first authenticator app of an account with a password to the password check, but not its first passkey', async () => {
    expect(await newFactorRefusal('/two-factor/enable', facts({ hasPassword: true }), now)).toBeUndefined()
    expect(await newFactorRefusal('/passkey/generate-register-options', facts({ hasPassword: true }), now)).toEqual(emailCodeSignInRequired)
  })
})
