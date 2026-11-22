import { describe, expect, it } from 'vitest'
import { chooseSender, usableSenders } from './mail-sender'
import { MailSenderRefusedError } from './mail-sender-refused'
import { senderRows } from './sender-rows'
import type { MailSenderRow } from './sender-store'

const created = new Date('2026-10-01T09:00:00Z')
const row = (row: Partial<MailSenderRow> & Pick<MailSenderRow, 'id' | 'userId' | 'address'>): MailSenderRow => ({ shared: false, isDefault: false, signature: null, createdAt: created, ...row })
const proved = (accountId: string, at = '2026-10-05T09:00:00Z') => ({ verifiedAccountId: accountId, verifiedAt: new Date(at) })
const annsMailbox = async () => 'ann@gmail.example'

describe('a shared From address', () => {
  it("serves a verified shared address through its owner's mailbox, with the account the check proved it through", async () => {
    const store = senderRows([row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', name: 'Acme sales', shared: true, ...proved('acc-bob') })])
    expect(await chooseSender(store, 'ann', annsMailbox, 'Sales@acme.example')).toEqual({ address: 'sales@acme.example', name: 'Acme sales', ownerId: 'bob', through: 'acc-bob' })
    expect(await usableSenders(store, 'ann', annsMailbox)).toEqual([
      { address: 'ann@gmail.example', ownerId: 'ann' },
      { address: 'sales@acme.example', name: 'Acme sales', ownerId: 'bob' },
    ])
  })

  it('refuses a shared address no check proved, or whose proof was cleared, and does not list it', async () => {
    const store = senderRows([row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', shared: true, verifiedAt: new Date('2026-10-05T09:00:00Z'), verifiedAccountId: null })])
    await expect(chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
    expect(await usableSenders(store, 'ann', annsMailbox)).toEqual([{ address: 'ann@gmail.example', ownerId: 'ann' }])
  })

  it('refuses a verified address its owner keeps private', async () => {
    const store = senderRows([row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', ...proved('acc-bob') })])
    await expect(chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
    expect(await usableSenders(store, 'ann', annsMailbox)).not.toContainEqual(expect.objectContaining({ address: 'sales@acme.example' }))
  })

  it('reads the rows again on every send, so an address unshared after it was listed is refused', async () => {
    const rows = [row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', shared: true, ...proved('acc-bob') })]
    const store = senderRows(rows)
    expect(await usableSenders(store, 'ann', annsMailbox)).toContainEqual(expect.objectContaining({ address: 'sales@acme.example' }))
    rows[0]!.shared = false
    await expect(chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
  })

  it('reaches only the people who share an organization with its owner now', async () => {
    const rows = [row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', shared: true, ...proved('acc-bob') })]
    const peers: Record<string, string[]> = { ann: ['bob'], cy: [] }
    const store = senderRows(rows, peers)
    expect(await chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).toMatchObject({ ownerId: 'bob' })
    await expect(chooseSender(store, 'cy', async () => undefined, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
    expect(await usableSenders(store, 'cy', async () => undefined)).toEqual([])
    // Ann left the organization.
    peers.ann = []
    await expect(chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
  })

  it("goes through the owner whose check is the latest, then the next once that one's is cleared, and is refused with none", async () => {
    const rows = [
      row({ id: 'a1', userId: 'bob', address: 'sales@acme.example', shared: true, ...proved('acc-bob', '2026-10-02T09:00:00Z') }),
      row({ id: 'c1', userId: 'cy', address: 'sales@acme.example', shared: true, ...proved('acc-cy', '2026-10-09T09:00:00Z') }),
    ]
    const store = senderRows(rows)
    expect(await chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).toMatchObject({ ownerId: 'cy', through: 'acc-cy' })
    expect((await usableSenders(store, 'ann', annsMailbox)).filter((sender) => sender.address === 'sales@acme.example')).toEqual([{ address: 'sales@acme.example', ownerId: 'cy' }])
    rows[1]!.verifiedAccountId = null
    expect(await chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).toMatchObject({ ownerId: 'bob', through: 'acc-bob' })
    rows[0]!.verifiedAccountId = null
    await expect(chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
  })

  it("prefers the person's own entry of an address over one shared with them", async () => {
    const store = senderRows([
      row({ id: 'a1', userId: 'ann', address: 'sales@acme.example' }),
      row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', shared: true, ...proved('acc-bob') }),
    ])
    expect(await chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).toEqual({ address: 'sales@acme.example', ownerId: 'ann' })
    expect((await usableSenders(store, 'ann', annsMailbox)).filter((sender) => sender.address === 'sales@acme.example')).toEqual([{ address: 'sales@acme.example', ownerId: 'ann' }])
  })
})
