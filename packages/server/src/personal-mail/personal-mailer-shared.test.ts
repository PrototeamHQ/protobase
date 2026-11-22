import { describe, expect, it, vi } from 'vitest'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { MailSenderRefusedError } from './mail-sender-refused'
import { PersonalMailError } from './personal-mail-error'
import type { PersonalMailProvider } from './personal-mail-provider'
import { personalMailer } from './personal-mailer'
import { senderRows } from './sender-rows'
import type { MailSenderRow } from './sender-store'

const sendScope = 'https://www.googleapis.com/auth/gmail.send'
const message = { to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.' }
const created = new Date('2026-10-01T09:00:00Z')

const provider = (): PersonalMailProvider => ({ id: 'gmail', name: 'Gmail', signInProvider: 'google', scopes: [sendScope], linkParams: {}, send: vi.fn(async () => ({})) })
const linked = (id: string, address?: string): LinkedAccount => ({ id, providerId: 'google', scopes: [sendScope], createdAt: created, ...(address && { address }) })
const row = (row: Partial<MailSenderRow> & Pick<MailSenderRow, 'id' | 'userId' | 'address'>): MailSenderRow => ({ shared: false, isDefault: false, signature: null, createdAt: created, ...row })

// Bob shared sales@ once a check proved it through his Gmail, acc-bob.
const senders = senderRows([row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', shared: true, verifiedAccountId: 'acc-bob', verifiedAt: created })])

const accountsOf = (byUser: Record<string, LinkedAccount[]>, accessToken: LinkedAccounts['accessToken'] = async (userId) => `access-${userId}`): LinkedAccounts => ({
  accounts: async (userId) => byUser[userId] ?? [],
  accessToken: vi.fn(accessToken),
})

describe('sending from an address another person shared', () => {
  it("goes out through the owner's mailbox, from the shared address", async () => {
    const gmail = provider()
    const accounts = accountsOf({ ann: [linked('acc-ann')], bob: [linked('acc-bob', 'bob@gmail.example')] })
    await personalMailer(accounts, [gmail], senders, 'ann').send({ ...message, from: 'sales@acme.example' })
    expect(accounts.accessToken).toHaveBeenCalledWith('bob', expect.objectContaining({ id: 'acc-bob' }), 'gmail')
    expect(gmail.send).toHaveBeenCalledWith(message, 'access-bob', { address: 'sales@acme.example' })
  })

  it('is refused, sending nothing, once the owner sends through another mailbox than the check proved', async () => {
    const gmail = provider()
    const accounts = accountsOf({ bob: [linked('acc-bob-2')] })
    await expect(personalMailer(accounts, [gmail], senders, 'ann').send({ ...message, from: 'sales@acme.example' })).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
    expect(accounts.accessToken).not.toHaveBeenCalled()
    expect(gmail.send).not.toHaveBeenCalled()
  })

  it("is not_linked as another's mailbox, naming only the shared address, when the owner linked none", async () => {
    const failure = personalMailer(accountsOf({ ann: [linked('acc-ann')] }), [provider()], senders, 'ann').send({ ...message, from: 'sales@acme.example' })
    await expect(failure).rejects.toBeInstanceOf(PersonalMailError)
    await expect(failure).rejects.toMatchObject({ code: 'not_linked', status: 409, extras: { code: 'not_linked', owner: 'other', address: 'sales@acme.example' } })
    const error = (await failure.catch((caught: unknown) => caught)) as PersonalMailError
    expect(Object.keys(error.extras).toSorted()).toEqual(['address', 'code', 'owner'])
    expect(JSON.stringify({ ...error.extras, detail: error.message })).not.toMatch(/bob|acc-/)
  })

  it("is link_expired as another's mailbox, without the owner's provider, when the owner's token cannot be refreshed or the provider refuses it", async () => {
    const expired = accountsOf({ bob: [linked('acc-bob', 'bob@gmail.example')] }, async () => {
      throw new PersonalMailError('link_expired', 'gmail')
    })
    const failure = personalMailer(expired, [provider()], senders, 'ann').send({ ...message, from: 'sales@acme.example' })
    await expect(failure).rejects.toMatchObject({ code: 'link_expired', provider: undefined, extras: { code: 'link_expired', owner: 'other', address: 'sales@acme.example' } })
    const error = (await failure.catch((caught: unknown) => caught)) as PersonalMailError
    expect(Object.keys(error.extras).toSorted()).toEqual(['address', 'code', 'owner'])
    expect(error.message).not.toMatch(/bob/)

    const gmail = provider()
    vi.mocked(gmail.send).mockRejectedValue(new PersonalMailError('link_expired', 'gmail'))
    await expect(personalMailer(accountsOf({ bob: [linked('acc-bob')] }), [gmail], senders, 'ann').send({ ...message, from: 'sales@acme.example' })).rejects.toMatchObject({ extras: { code: 'link_expired', owner: 'other', address: 'sales@acme.example' } })
  })

  it("is not_linked without the marker for the sender's own address", async () => {
    const own = senderRows([row({ id: 'a1', userId: 'ann', address: 'ann@acme.example' })])
    await expect(personalMailer(accountsOf({}), [provider()], own, 'ann').send({ ...message, from: 'ann@acme.example' })).rejects.toEqual(new PersonalMailError('not_linked'))
  })

  it('hands no account id out of sender()', async () => {
    const accounts = accountsOf({ ann: [linked('acc-ann')], bob: [linked('acc-bob')] })
    expect(await personalMailer(accounts, [provider()], senders, 'ann').sender('sales@acme.example')).toEqual({ address: 'sales@acme.example', ownerId: 'bob' })
  })
})
