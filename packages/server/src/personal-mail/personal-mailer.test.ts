import { describe, expect, it, vi } from 'vitest'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { PersonalMailError } from './personal-mail-error'
import type { PersonalMailProvider } from './personal-mail-provider'
import { personalMailer } from './personal-mailer'

const sendScope = 'https://www.googleapis.com/auth/gmail.send'
const message = { to: 'ada@example.com', subject: 'Invoice 7', text: 'Attached.', attachments: [{ filename: 'invoice-7.pdf', content: new Uint8Array([37, 80, 68, 70]) }] }

const provider = (): PersonalMailProvider => ({ id: 'gmail', name: 'Gmail', signInProvider: 'google', scopes: [sendScope], linkParams: {}, send: vi.fn(async () => {}) })

const accountsOf = (accounts: LinkedAccount[], accessToken: LinkedAccounts['accessToken'] = async () => 'access-1'): LinkedAccounts => ({ accounts: async () => accounts, accessToken: vi.fn(accessToken) })

describe('personalMailer', () => {
  it('sends through the linked provider with a valid access token', async () => {
    const gmail = provider()
    const accounts = accountsOf([{ id: 'acc-1', providerId: 'google', scopes: ['openid', sendScope] }])
    await personalMailer(accounts, [gmail], 'u1').send(message)
    expect(accounts.accessToken).toHaveBeenCalledWith('u1', { id: 'acc-1', providerId: 'google', scopes: ['openid', sendScope] }, 'gmail')
    expect(gmail.send).toHaveBeenCalledWith(message, 'access-1')
  })

  it('is not_linked, sending nothing, for a user with no linked provider', async () => {
    const gmail = provider()
    await expect(personalMailer(accountsOf([{ id: 'cred', providerId: 'credential', scopes: [] }]), [gmail], 'u1').send(message)).rejects.toEqual(new PersonalMailError('not_linked'))
    expect(gmail.send).not.toHaveBeenCalled()
  })

  it('is not_linked for a Google sign-in that never allowed sending mail', async () => {
    const gmail = provider()
    const accounts = accountsOf([{ id: 'acc-1', providerId: 'google', scopes: ['openid', 'email', 'profile'] }])
    await expect(personalMailer(accounts, [gmail], 'u1').send(message)).rejects.toMatchObject({ code: 'not_linked', status: 409, extras: { code: 'not_linked' } })
    expect(accounts.accessToken).not.toHaveBeenCalled()
  })

  it('is link_expired, sending nothing, when the token cannot be refreshed', async () => {
    const gmail = provider()
    const accounts = accountsOf([{ id: 'acc-1', providerId: 'google', scopes: [sendScope] }], async () => {
      throw new PersonalMailError('link_expired', 'gmail')
    })
    await expect(personalMailer(accounts, [gmail], 'u1').send(message)).rejects.toMatchObject({ code: 'link_expired', provider: 'gmail' })
    expect(gmail.send).not.toHaveBeenCalled()
  })
})
