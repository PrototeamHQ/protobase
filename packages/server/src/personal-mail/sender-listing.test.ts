import { describe, expect, it, vi } from 'vitest'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { PersonalMailError } from './personal-mail-error'
import { SenderListingError, type PersonalMailProvider, type SenderAddressListing } from './personal-mail-provider'
import { listConnections } from './sender-listing'
import { senderRows, typedRow } from './sender-rows'

const sendScope = 'https://www.googleapis.com/auth/gmail.send'
const created = new Date('2026-11-01T09:00:00Z')
const now = new Date('2026-11-20T09:00:00Z')

const provider = (list: (accessToken: string) => Promise<SenderAddressListing>): PersonalMailProvider => ({
  id: 'gmail',
  name: 'Gmail',
  signInProvider: 'google',
  scopes: [sendScope],
  optionalScopes: [],
  addedScopes: [],
  linkParams: {},
  send: vi.fn(),
  list_sender_addresses: vi.fn(({ accessToken }) => list(accessToken)),
})

const account = (id: string): LinkedAccount => ({ id, providerId: 'google', scopes: [sendScope], createdAt: created })

describe('listConnections', () => {
  it('lists each connection on its own: a token or listing that fails changes nothing of its own and stops none of the others', async () => {
    const senders = senderRows([
      typedRow({ id: 'a1', userId: 'u1', connectionId: 'expired', address: 'a@acme.example', listedAt: created, providerStateReadAt: created, providerState: 'verified' }),
      typedRow({ id: 'b1', userId: 'u1', connectionId: 'down', address: 'b@acme.example', listedAt: created, providerStateReadAt: created, providerState: 'verified' }),
      typedRow({ id: 'c1', userId: 'u1', connectionId: 'fine', address: 'c@acme.example' }),
      typedRow({ id: 'c2', userId: 'u1', connectionId: 'fine', address: 'gone@acme.example', listedAt: created, providerStateReadAt: created, providerState: 'verified' }),
      typedRow({ id: 'c3', userId: 'u1', connectionId: 'fine', address: 'not-yet@acme.example' }, new Date('2026-11-21T09:00:00Z')),
    ])
    const before = structuredClone(senders.rows.slice(0, 2))
    const accounts: LinkedAccounts = {
      accounts: async () => [],
      accessToken: async (_userId, { id }) => {
        if (id === 'expired') throw new PersonalMailError('link_expired', 'gmail')
        return `token-${id}`
      },
    }
    const gmail = provider(async (token) => {
      if (token === 'token-down') throw new SenderListingError('down')
      return { kind: 'listed', addresses: [{ address: 'c@acme.example', provider_state: 'verified' }, { address: 'new@acme.example', provider_state: 'pending' }] }
    })
    const connections = ['expired', 'down', 'fine'].map((id) => ({ account: account(id), provider: gmail }))

    expect(await listConnections({ accounts, senders, userId: 'u1', now: () => now }, connections)).toEqual([
      { connection: 'expired', provider: 'gmail', status: 'error', code: 'link_expired' },
      { connection: 'down', provider: 'gmail', status: 'error', code: 'listing_failed' },
      { connection: 'fine', provider: 'gmail', status: 'listed' },
    ])
    expect(senders.rows.slice(0, 2)).toEqual(before)
    const row = (id: string) => senders.rows.find((candidate) => candidate.id === id)
    expect(row('c1')).toMatchObject({ id: 'c1', typedAt: new Date('2026-10-01T09:00:00Z'), listedAt: now, providerState: 'verified', providerStateReadAt: now })
    // Absence clears only what the listing said: the row, its id and what was typed stay.
    expect(row('c2')).toMatchObject({ id: 'c2', typedAt: new Date('2026-10-01T09:00:00Z'), listedAt: null, providerState: null, providerStateReadAt: now })
    // Typed after the listing was asked for, so the listing could not know it.
    expect(row('c3')).toMatchObject({ listedAt: null, providerStateReadAt: null })
    expect(senders.rows.find(({ address }) => address === 'new@acme.example')).toMatchObject({ userId: 'u1', connectionId: 'fine', typedAt: null, providerState: 'pending' })
  })

  it('answers not_permitted with the missing scopes, recording nothing', async () => {
    const senders = senderRows([typedRow({ id: 'a1', userId: 'u1', connectionId: 'c', address: 'a@acme.example' })])
    const before = structuredClone(senders.rows)
    const gmail = provider(async () => ({ kind: 'not_permitted', missing_scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'] }))
    const accounts: LinkedAccounts = { accounts: async () => [], accessToken: async () => 'token' }
    expect(await listConnections({ accounts, senders, userId: 'u1', now: () => now }, [{ account: account('c'), provider: gmail }])).toEqual([
      { connection: 'c', provider: 'gmail', status: 'not_permitted', missing_scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'] },
    ])
    expect(senders.rows).toEqual(before)
  })

  it('skips a connection whose provider cannot list, and throws an unexpected error once the others had their turn', async () => {
    const senders = senderRows()
    const { list_sender_addresses: _, ...cannot } = provider(async () => ({ kind: 'listed', addresses: [] }))
    const broken = provider(async () => {
      throw new RangeError('bug')
    })
    const fine = provider(async () => ({ kind: 'listed', addresses: [{ address: 'x@acme.example' }] }))
    const accounts: LinkedAccounts = { accounts: async () => [], accessToken: async () => 'token' }
    const connections = [{ account: account('n'), provider: cannot }, { account: account('b'), provider: broken }, { account: account('f'), provider: fine }]
    await expect(listConnections({ accounts, senders, userId: 'u1', now: () => now }, connections)).rejects.toThrow(RangeError)
    expect(fine.list_sender_addresses).toHaveBeenCalled()
    expect(senders.rows).toMatchObject([{ address: 'x@acme.example', connectionId: 'f' }])
  })
  it('leaves what a later listing said when an earlier one records after it', async () => {
    const later = new Date('2026-11-21T09:00:00Z')
    const senders = senderRows([
      typedRow({ id: 'a1', userId: 'u1', connectionId: 'c', address: 'a@acme.example', listedAt: later, providerStateReadAt: later, providerState: 'verified' }),
      typedRow({ id: 'a2', userId: 'u1', connectionId: 'c', address: 'b@acme.example', listedAt: later, providerStateReadAt: later, providerState: 'verified' }),
    ])
    const before = structuredClone(senders.rows)
    // Asked for at `now`, before the listing at `later`, and recorded after it: it neither downgrades a1 nor clears a2.
    await senders.recordListing('u1', 'c', [{ address: 'a@acme.example', provider_state: 'pending' }], now)
    expect(senders.rows).toEqual(before)
  })
})
