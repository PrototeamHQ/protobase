import { describe, expect, it, vi } from 'vitest'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { PersonalMailError } from './personal-mail-error'
import type { PersonalMailProvider } from './personal-mail-provider'
import { personalMailer } from './personal-mailer'
import { SenderAddressError, SenderAddressNotFoundError } from './sender-address-error'
import { MailSenderRefusedError } from './mail-sender-refused'
import { senderRows, typedRow } from './sender-rows'
import type { SharedSenderRow } from './shared-sender-store'
import { sharedState } from './shared-senders'

const sendScope = 'https://www.googleapis.com/auth/gmail.send'
const message = { to: 'ada@example.com', subject: 'Invoice 7', text: 'Attached.' }
const created = new Date('2026-10-01T09:00:00Z')
const later = new Date('2026-10-20T09:00:00Z')

const provider = (): PersonalMailProvider => ({
  id: 'gmail',
  name: 'Gmail',
  signInProvider: 'google',
  scopes: [sendScope],
  optionalScopes: [],
  addedScopes: [],
  linkParams: {},
  send: vi.fn(async () => ({ messageId: '<m1@acme.example>' })),
})

// The colleague, u1, linked their own Gmail; u2 owns the shared addresses, on their account acc-u2.
const accounts = (accessToken: LinkedAccounts['accessToken'] = async (userId, account) => `access-${userId}-${account.id}`): LinkedAccounts => ({
  accounts: async () => [{ id: 'acc-u1', providerId: 'google', scopes: [sendScope], createdAt: created, address: 'u1@gmail.example' } satisfies LinkedAccount],
  accessToken: vi.fn(accessToken),
})

const ownerAccount = { id: 'acc-u2', providerId: 'google', scope: `openid,${sendScope}`, createdAt: created }
const verified = { listedAt: later, providerStateReadAt: later, providerState: 'verified' }

const shared = (row: Partial<SharedSenderRow> & Pick<SharedSenderRow, 'id' | 'address'>): SharedSenderRow => ({
  ...typedRow({ userId: 'u2', connectionId: 'acc-u2', sharedAt: later, ...row }),
  account: ownerAccount,
  provedAt: null,
  ...row,
})

// The rows the reader would answer: those shared with u1 and in reach.
const store = (rows: SharedSenderRow[]) => ({ ...senderRows([typedRow({ id: 'own', userId: 'u1', connectionId: 'acc-u1', address: 'me@acme.example' })]), sharedWith: vi.fn(async (_userId: string, id?: string) => rows.filter((row) => id === undefined || row.id === id)) })

describe('sharedState', () => {
  it('is verified by the provider, or by a proof since the address was last removed; detached without the owner’s account', () => {
    expect(sharedState(shared({ id: 'a', address: 'a@acme.example', ...verified }), [provider()])).toBe('verified')
    expect(sharedState(shared({ id: 'a', address: 'a@acme.example', provedAt: later }), [provider()])).toBe('verified')
    expect(sharedState(shared({ id: 'a', address: 'a@acme.example' }), [provider()])).toBe('unverified')
    expect(sharedState(shared({ id: 'a', address: 'a@acme.example', ...verified, account: null }), [provider()])).toBe('detached')
    expect(sharedState(shared({ id: 'a', address: 'a@acme.example', ...verified, account: { ...ownerAccount, scope: 'openid' } }), [provider()])).toBe('detached')
  })
})

describe('sending from a shared address', () => {
  it('goes out through the owner’s connection, with the owner’s token, from that address', async () => {
    const gmail = provider()
    const linked = accounts()
    await personalMailer(linked, [gmail], store([shared({ id: 'b', address: 'billing@acme.example', name: 'Billing', ...verified })]), 'u1').send({ ...message, sender_address_id: 'b' })
    expect(linked.accessToken).toHaveBeenCalledWith('u2', expect.objectContaining({ id: 'acc-u2' }), 'gmail')
    expect(gmail.send).toHaveBeenCalledWith(message, 'access-u2-acc-u2', { address: 'billing@acme.example', name: 'Billing' })
  })

  it('goes out on a verifier’s proof that still counts, and is refused once it no longer does', async () => {
    const gmail = provider()
    await personalMailer(accounts(), [gmail], store([shared({ id: 'b', address: 'billing@acme.example', provedAt: later })]), 'u1').send({ ...message, sender_address_id: 'b' })
    expect(gmail.send).toHaveBeenCalledTimes(1)
    await expect(personalMailer(accounts(), [gmail], store([shared({ id: 'b', address: 'billing@acme.example' })]), 'u1').send({ ...message, sender_address_id: 'b' })).rejects.toEqual(new SenderAddressNotFoundError())
    expect(gmail.send).toHaveBeenCalledTimes(1)
  })

  it('refuses one no longer verified, pending, unshared or out of reach as not the sender’s, naming nothing of the owner', async () => {
    const gmail = provider()
    const rows = [
      shared({ id: 'failed', address: 'f@acme.example', listedAt: null, providerStateReadAt: later }),
      shared({ id: 'pending', address: 'p@acme.example', listedAt: later, providerStateReadAt: later, providerState: 'pending' }),
    ]
    for (const id of ['failed', 'pending', 'unshared']) {
      const refusal = await personalMailer(accounts(), [gmail], store(rows), 'u1').send({ ...message, sender_address_id: id }).catch((error: unknown) => error)
      expect(refusal, id).toEqual(new SenderAddressNotFoundError())
      expect(JSON.stringify(refusal), id).not.toMatch(/u2|acc-u2/)
    }
    expect(gmail.send).not.toHaveBeenCalled()
  })

  it('tells the sender the owner must connect their mailbox again when it is gone or its link expired', async () => {
    const gmail = provider()
    const gone = store([shared({ id: 'b', address: 'billing@acme.example', ...verified, account: null })])
    await expect(personalMailer(accounts(), [gmail], gone, 'u1').send({ ...message, sender_address_id: 'b' })).rejects.toEqual(new SenderAddressError('sender_address_owner_unlinked'))
    const expired = accounts(async () => {
      throw new PersonalMailError('link_expired', 'gmail')
    })
    const refusal = await personalMailer(expired, [gmail], store([shared({ id: 'b', address: 'billing@acme.example', ...verified })]), 'u1').send({ ...message, sender_address_id: 'b' }).catch((error: unknown) => error)
    expect(refusal).toEqual(new SenderAddressError('sender_address_owner_unlinked'))
    expect(gmail.send).not.toHaveBeenCalled()
  })

  it('never reads the shared addresses for the sender’s own record', async () => {
    const senders = store([])
    await personalMailer(accounts(), [provider()], senders, 'u1').send({ ...message, sender_address_id: 'own' })
    expect(senders.sharedWith).not.toHaveBeenCalled()
  })
})

describe('shared addresses among the senders', () => {
  const rows = [shared({ id: 'b', address: 'billing@acme.example', ...verified }), shared({ id: 'x', address: 'stale@acme.example' }), shared({ id: 'm', address: 'ME@acme.example', ...verified })]

  it('lists the verified ones after the person’s own, without their owner, leaving out one the person holds too', async () => {
    expect(await personalMailer(accounts(), [provider()], store(rows), 'u1').senders()).toEqual([
      { id: null, address: 'u1@gmail.example', ownerId: 'u1', state: 'verified' },
      { id: 'own', address: 'me@acme.example', ownerId: 'u1', state: 'unverified' },
      { id: 'b', address: 'billing@acme.example', shared: true, state: 'verified' },
    ])
  })

  it('resolves a shared address after the person’s own, and refuses one shared by two people or no longer verified', async () => {
    const mail = personalMailer(accounts(), [provider()], store(rows), 'u1')
    expect(await mail.sender('Billing@acme.example')).toEqual({ id: 'b', address: 'billing@acme.example', shared: true, state: 'verified' })
    expect(await mail.sender('me@acme.example')).toMatchObject({ id: 'own', ownerId: 'u1' })
    await expect(mail.sender('stale@acme.example')).rejects.toEqual(new MailSenderRefusedError('stale@acme.example'))
    const twice = personalMailer(accounts(), [provider()], store([...rows, shared({ id: 'b2', userId: 'u3', address: 'billing@acme.example', ...verified })]), 'u1')
    await expect(twice.sender('billing@acme.example')).rejects.toEqual(new SenderAddressError('sender_address_ambiguous'))
  })
})
