import { describe, expect, it, vi } from 'vitest'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { PersonalMailError } from './personal-mail-error'
import { SenderListingError, type PersonalMailProvider } from './personal-mail-provider'
import { personalMailer, type PersonalMailMessage } from './personal-mailer'
import { SenderAddressError, SenderAddressNotFoundError } from './sender-address-error'
import { MailSenderRefusedError } from './mail-sender-refused'
import { senderRows, typedRow } from './sender-rows'

const noSenders = senderRows()

const sendScope = 'https://www.googleapis.com/auth/gmail.send'
const message = { to: 'ada@example.com', subject: 'Invoice 7', text: 'Attached.', attachments: [{ filename: 'invoice-7.pdf', content: new Uint8Array([37, 80, 68, 70]) }] }

const provider = (list?: PersonalMailProvider['list_sender_addresses']): PersonalMailProvider => ({
  id: 'gmail',
  name: 'Gmail',
  signInProvider: 'google',
  scopes: [sendScope],
  optionalScopes: [],
  addedScopes: [],
  linkParams: {},
  send: vi.fn(async () => ({ messageId: '<m1@acme.example>' })),
  ...(list && { list_sender_addresses: vi.fn(list) }),
})

const created = new Date('2026-10-01T09:00:00Z')
const later = new Date('2026-10-20T09:00:00Z')

const accountsOf = (accounts: LinkedAccount[], accessToken: LinkedAccounts['accessToken'] = async () => 'access-1'): LinkedAccounts => ({ accounts: async () => accounts, accessToken: vi.fn(accessToken) })

describe('personalMailer', () => {
  it('sends through the linked provider with a valid access token', async () => {
    const gmail = provider()
    const accounts = accountsOf([{ id: 'acc-1', providerId: 'google', scopes: ['openid', sendScope], createdAt: created }])
    expect(await personalMailer(accounts, [gmail], noSenders, 'u1').send(message)).toEqual({ messageId: '<m1@acme.example>' })
    expect(accounts.accessToken).toHaveBeenCalledWith('u1', { id: 'acc-1', providerId: 'google', scopes: ['openid', sendScope], createdAt: created }, 'gmail')
    expect(gmail.send).toHaveBeenCalledWith(message, 'access-1', undefined)
  })

  it('is not_linked, sending nothing, for a user with no linked provider', async () => {
    const gmail = provider()
    await expect(personalMailer(accountsOf([{ id: 'cred', providerId: 'credential', scopes: [], createdAt: created }]), [gmail], noSenders, 'u1').send(message)).rejects.toEqual(new PersonalMailError('not_linked'))
    expect(gmail.send).not.toHaveBeenCalled()
  })

  it('is not_linked for a Google sign-in that never allowed sending mail', async () => {
    const gmail = provider()
    const accounts = accountsOf([{ id: 'acc-1', providerId: 'google', scopes: ['openid', 'email', 'profile'], createdAt: created }])
    await expect(personalMailer(accounts, [gmail], noSenders, 'u1').send(message)).rejects.toMatchObject({ code: 'not_linked', status: 409, extras: { code: 'not_linked' } })
    expect(accounts.accessToken).not.toHaveBeenCalled()
  })

  it('is link_expired, sending nothing, when the token cannot be refreshed', async () => {
    const gmail = provider()
    const accounts = accountsOf([{ id: 'acc-1', providerId: 'google', scopes: [sendScope], createdAt: created }], async () => {
      throw new PersonalMailError('link_expired', 'gmail')
    })
    await expect(personalMailer(accounts, [gmail], noSenders, 'u1').send(message)).rejects.toMatchObject({ code: 'link_expired', provider: 'gmail' })
    expect(gmail.send).not.toHaveBeenCalled()
  })

  it('sends through the account that holds the mail scopes, not another Google account of the person', async () => {
    const gmail = provider()
    const accounts = accountsOf([
      { id: 'acc-a', providerId: 'google', scopes: ['openid'], createdAt: created },
      { id: 'acc-b', providerId: 'google', scopes: ['openid', sendScope], createdAt: created },
      { id: 'acc-c', providerId: 'google', scopes: ['openid'], createdAt: later },
    ])
    await personalMailer(accounts, [gmail], noSenders, 'u1').send(message)
    expect(accounts.accessToken).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'acc-b' }), 'gmail')
  })

  it('sends through the one created last, on every send, when two accounts both hold the mail scopes', async () => {
    const gmail = provider()
    const accounts = accountsOf([
      { id: 'acc-new', providerId: 'google', scopes: [sendScope], createdAt: later },
      { id: 'acc-old', providerId: 'google', scopes: [sendScope], createdAt: created },
    ])
    const reversed = accountsOf([...(await accounts.accounts('u1'))].reverse())
    await personalMailer(accounts, [gmail], noSenders, 'u1').send(message)
    await personalMailer(reversed, [gmail], noSenders, 'u1').send(message)
    expect(accounts.accessToken).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'acc-new' }), 'gmail')
    expect(reversed.accessToken).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'acc-new' }), 'gmail')
  })

  it('is link_expired, trying no other account, when the chosen account’s grant fails', async () => {
    const gmail = provider()
    const accounts = accountsOf(
      [
        { id: 'acc-old', providerId: 'google', scopes: [sendScope], createdAt: created },
        { id: 'acc-new', providerId: 'google', scopes: [sendScope], createdAt: later },
      ],
      async () => {
        throw new PersonalMailError('link_expired', 'gmail')
      },
    )
    await expect(personalMailer(accounts, [gmail], noSenders, 'u1').send(message)).rejects.toMatchObject({ code: 'link_expired' })
    expect(accounts.accessToken).toHaveBeenCalledTimes(1)
    expect(accounts.accessToken).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'acc-new' }), 'gmail')
    expect(gmail.send).not.toHaveBeenCalled()
  })

  describe('with From addresses', () => {
    const linked = (id: string, createdAt = created) => ({ id, providerId: 'google', scopes: [sendScope], createdAt })
    // Each person linked their own Gmail; u1 linked a second one, acc-u1b, later, which mail without a From goes through.
    const both = (): LinkedAccounts => ({
      accounts: async (userId) => (userId === 'u1' ? [linked('acc-u1'), linked('acc-u1b', later)] : [linked(`acc-${userId}`)]),
      accessToken: vi.fn(async (userId: string, account: LinkedAccount) => `access-${userId}-${account.id}`),
    })
    const rows = () =>
      senderRows([
        typedRow({ id: 's1', userId: 'u1', connectionId: 'acc-u1', address: 'billing@acme.example' }),
        typedRow({ id: 's2', userId: 'u2', connectionId: 'acc-u2', address: 'sales@acme.example', sharedAt: later }),
        typedRow({ id: 's4', userId: 'u1', connectionId: 'acc-u1', address: 'ann@acme.example', name: 'Ann of Acme' }),
        typedRow({ id: 's5', userId: 'u1', connectionId: 'acc-u1', address: 'gone@acme.example', removedAt: later }),
        typedRow({ id: 's6', userId: 'u1', connectionId: null, address: 'old@acme.example' }),
        typedRow({ id: 's7', userId: 'u1', connectionId: 'acc-u1', address: 'no@acme.example', providerStateReadAt: later }),
        typedRow({ id: 's8', userId: 'u1', connectionId: 'acc-u1', address: 'wait@acme.example', listedAt: later, providerStateReadAt: later, providerState: 'pending' }),
      ])

    it('sends from the record it names, through that record’s own connection, not the one mail goes through last', async () => {
      const gmail = provider()
      await personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, sender_address_id: 's1' })
      expect(gmail.send).toHaveBeenCalledWith(message, 'access-u1-acc-u1', { address: 'billing@acme.example' })
    })

    it('sends with the display name the person entered for the address', async () => {
      const gmail = provider()
      await personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, sender_address_id: 's4' })
      expect(gmail.send).toHaveBeenCalledWith(message, 'access-u1-acc-u1', { address: 'ann@acme.example', name: 'Ann of Acme' })
    })

    it('sends an unverified address on a mailbox that cannot list', async () => {
      const gmail = provider()
      await expect(personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, sender_address_id: 's1' })).resolves.toEqual({ messageId: '<m1@acme.example>' })
    })

    it('leaves the From header to the provider, through the connection mail goes through last, with neither an id nor a default', async () => {
      for (const sender_address_id of [undefined, null]) {
        const gmail = provider()
        await personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, ...(sender_address_id === null && { sender_address_id }) })
        expect(gmail.send).toHaveBeenCalledWith(message, 'access-u1-acc-u1b', undefined)
      }
    })

    it('sends from the default record without an id', async () => {
      const gmail = provider()
      const senders = rows()
      senders.rows[0]!.isDefault = true
      await personalMailer(both(), [gmail], senders, 'u1').send(message)
      expect(gmail.send).toHaveBeenCalledWith(message, 'access-u1-acc-u1', { address: 'billing@acme.example' })
    })

    it("answers another person's id, an unknown one and a removed one alike, before any call to a mailbox", async () => {
      for (const id of ['s2', 'nope', 's5']) {
        const gmail = provider()
        const accounts = both()
        const failure = await personalMailer(accounts, [gmail], rows(), 'u1').send({ ...message, sender_address_id: id }).catch((error: unknown) => error)
        expect(failure).toEqual(new SenderAddressNotFoundError())
        expect(failure).toMatchObject({ status: 404, extras: {} })
        expect(accounts.accessToken).not.toHaveBeenCalled()
        expect(gmail.send).not.toHaveBeenCalled()
      }
    })

    it('refuses a failed, pending or detached address, sending nothing', async () => {
      const cases = { s7: 'sender_address_failed', s8: 'sender_address_pending', s6: 'sender_address_detached' } as const
      for (const [id, code] of Object.entries(cases)) {
        const gmail = provider()
        await expect(personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, sender_address_id: id })).rejects.toEqual(new SenderAddressError(code))
        expect(gmail.send).not.toHaveBeenCalled()
      }
    })

    it('refuses a record whose connection no longer holds the send scope as detached', async () => {
      const gmail = provider()
      const accounts: LinkedAccounts = { accounts: async () => [{ ...linked('acc-u1'), scopes: ['openid'] }, linked('acc-u1b')], accessToken: vi.fn(async () => 'access') }
      await expect(personalMailer(accounts, [gmail], rows(), 'u1').send({ ...message, sender_address_id: 's1' })).rejects.toEqual(new SenderAddressError('sender_address_detached'))
      expect(gmail.send).not.toHaveBeenCalled()
    })

    it('takes no From of the caller’s own, in the message or its headers', async () => {
      for (const extra of [{ from: 'ceo@acme.example' }, { sender: 'ceo@acme.example' }, { headers: { From: 'ceo@acme.example' } }]) {
        const gmail = provider()
        await expect(personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, sender_address_id: 's1', ...extra } as PersonalMailMessage)).rejects.toThrow('sender_address_id')
        expect(gmail.send).not.toHaveBeenCalled()
      }
    })

    describe('on a mailbox that can list', () => {
      it('lists an address no listing read before it first goes out, and refuses it when the listing does not hold it', async () => {
        const gmail = provider(async () => ({ kind: 'listed', addresses: [{ address: 'u1@gmail.example', provider_state: 'verified' }] }))
        const senders = rows()
        await expect(personalMailer(both(), [gmail], senders, 'u1').send({ ...message, sender_address_id: 's1' })).rejects.toEqual(new SenderAddressError('sender_address_failed'))
        expect(gmail.list_sender_addresses).toHaveBeenCalledWith({ accessToken: 'access-u1-acc-u1', scopes: [sendScope] })
        expect(gmail.send).not.toHaveBeenCalled()
        expect(senders.rows.find(({ id }) => id === 's1')).toMatchObject({ listedAt: null, providerStateReadAt: expect.any(Date) })
      })

      it('sends an address the listing vouches for, listing it once', async () => {
        const gmail = provider(async () => ({ kind: 'listed', addresses: [{ address: 'billing@acme.example', provider_state: 'verified' }] }))
        const senders = rows()
        const mail = personalMailer(both(), [gmail], senders, 'u1')
        await mail.send({ ...message, sender_address_id: 's1' })
        await mail.send({ ...message, sender_address_id: 's1' })
        expect(gmail.send).toHaveBeenCalledTimes(2)
        expect(gmail.list_sender_addresses).toHaveBeenCalledTimes(1)
      })

      it('sends as unverified when the link may not list', async () => {
        const gmail = provider(async () => ({ kind: 'not_permitted', missing_scopes: ['settings'] }))
        await personalMailer(both(), [gmail], rows(), 'u1').send({ ...message, sender_address_id: 's1' })
        expect(gmail.send).toHaveBeenCalledWith(message, 'access-u1-acc-u1', { address: 'billing@acme.example' })
      })

      it('sends nothing when the listing fails, recording nothing', async () => {
        const gmail = provider(async () => {
          throw new SenderListingError('down')
        })
        const senders = rows()
        const before = structuredClone(senders.rows)
        await expect(personalMailer(both(), [gmail], senders, 'u1').send({ ...message, sender_address_id: 's1' })).rejects.toBeInstanceOf(SenderListingError)
        expect(gmail.send).not.toHaveBeenCalled()
        expect(senders.rows).toEqual(before)
      })
    })
  })

  describe('senders and sender', () => {
    const accounts = (): LinkedAccounts => ({ accounts: async () => [{ id: 'acc-1', providerId: 'google', scopes: [sendScope], createdAt: created, address: 'U1@gmail.example' }, { id: 'acc-2', providerId: 'google', scopes: [sendScope], createdAt: created }], accessToken: vi.fn(async () => 'access') })
    const senders = () =>
      senderRows([
        typedRow({ id: 's1', userId: 'u1', connectionId: 'acc-1', address: 'billing@acme.example', listedAt: later, providerStateReadAt: later, providerState: 'verified' }),
        typedRow({ id: 's2', userId: 'u1', connectionId: 'acc-1', address: 'shared@acme.example' }),
        typedRow({ id: 's3', userId: 'u1', connectionId: 'acc-2', address: 'shared@acme.example' }),
        typedRow({ id: 's4', userId: 'u1', connectionId: null, address: 'old@acme.example' }),
      ])

    it('lists the mailbox’s own address, then the records that can go out, each with its id and state', async () => {
      expect(await personalMailer(accounts(), [provider()], senders(), 'u1').senders()).toEqual([
        { id: null, address: 'U1@gmail.example', ownerId: 'u1', state: 'verified' },
        { id: 's1', address: 'billing@acme.example', ownerId: 'u1', state: 'verified' },
        { id: 's2', address: 'shared@acme.example', ownerId: 'u1', state: 'unverified' },
        { id: 's3', address: 'shared@acme.example', ownerId: 'u1', state: 'unverified' },
      ])
    })

    it('resolves an address to its record, the mailbox’s own to none, and refuses one on two connections or none', async () => {
      const mail = personalMailer(accounts(), [provider()], senders(), 'u1')
      expect(await mail.sender(' Billing@ACME.example ')).toMatchObject({ id: 's1', state: 'verified' })
      expect(await mail.sender('u1@gmail.example')).toMatchObject({ id: null })
      await expect(mail.sender('shared@acme.example')).rejects.toEqual(new SenderAddressError('sender_address_ambiguous'))
      await expect(mail.sender('old@acme.example')).rejects.toEqual(new MailSenderRefusedError('old@acme.example'))
      await expect(mail.sender('ceo@acme.example')).rejects.toEqual(new MailSenderRefusedError('ceo@acme.example'))
    })
  })
})
