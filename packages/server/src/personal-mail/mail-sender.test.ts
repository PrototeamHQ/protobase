import { describe, expect, it } from 'vitest'
import { chooseSender, usableSenders } from './mail-sender'
import { MailSenderRefusedError } from './mail-sender-refused'
import { senderRows } from './sender-rows'
import type { MailSenderRow } from './sender-store'

const created = new Date('2026-10-01T09:00:00Z')
const row = (row: Partial<MailSenderRow> & Pick<MailSenderRow, 'id' | 'userId' | 'address'>): MailSenderRow => ({ shared: false, isDefault: false, signature: null, createdAt: created, ...row })

const store = senderRows([
  row({ id: 's1', userId: 'ann', address: 'billing@acme.example', signature: 'Warm regards,\nAnn of Acme' }),
  row({ id: 's2', userId: 'ann', address: 'ann@side.example', isDefault: true }),
  row({ id: 's3', userId: 'bob', address: 'sales@acme.example', shared: true }),
  row({ id: 's4', userId: 'bob', address: 'bob@private.example' }),
])
const annsMailbox = async () => 'Ann@gmail.example'

describe('chooseSender', () => {
  it('sends as an address the person entered, with its own signature', async () => {
    expect(await chooseSender(store, 'ann', annsMailbox, 'billing@acme.example')).toEqual({ address: 'billing@acme.example', ownerId: 'ann', signature: 'Warm regards,\nAnn of Acme', shared: false })
  })

  it('matches an address without regard to case, sending as it was entered', async () => {
    expect(await chooseSender(store, 'ann', annsMailbox, ' Billing@ACME.example ')).toMatchObject({ address: 'billing@acme.example' })
  })

  it('sends as the default address without a From address', async () => {
    expect(await chooseSender(store, 'ann', annsMailbox)).toEqual({ address: 'ann@side.example', ownerId: 'ann', shared: false })
  })

  it("sends as the mailbox's own address without a From address or a default", async () => {
    expect(await chooseSender(store, 'bob', async () => 'bob@gmail.example')).toEqual({ address: 'bob@gmail.example', ownerId: 'bob', shared: false })
    // A link that names no address leaves the From header to the provider.
    expect(await chooseSender(store, 'bob', async () => undefined)).toEqual({ ownerId: 'bob', shared: false })
  })

  it("accepts the mailbox's own address without it being entered", async () => {
    expect(await chooseSender(store, 'ann', annsMailbox, 'ann@gmail.example')).toEqual({ address: 'Ann@gmail.example', ownerId: 'ann', shared: false })
  })

  it("sends as another person's shared address through their mailbox", async () => {
    expect(await chooseSender(store, 'ann', annsMailbox, 'sales@acme.example')).toEqual({ address: 'sales@acme.example', ownerId: 'bob', shared: true })
  })

  it('refuses an address nobody entered, naming it', async () => {
    const refusal = chooseSender(store, 'ann', annsMailbox, 'ceo@acme.example')
    await expect(refusal).rejects.toEqual(new MailSenderRefusedError('ceo@acme.example'))
    await expect(refusal).rejects.toMatchObject({ status: 403, message: expect.stringContaining('ceo@acme.example') })
  })

  it('refuses a shared address of someone outside every organization of the sender, as an unknown one', async () => {
    const apart = senderRows([row({ id: 's3', userId: 'bob', address: 'sales@acme.example', shared: true })], async () => new Set(['ann', 'cy']))
    await expect(chooseSender(apart, 'ann', annsMailbox, 'sales@acme.example')).rejects.toEqual(new MailSenderRefusedError('sales@acme.example'))
    expect(await usableSenders(apart, 'ann', annsMailbox)).toEqual([{ address: 'Ann@gmail.example', ownerId: 'ann', shared: false }])
  })

  it("refuses another person's private address the same way", async () => {
    await expect(chooseSender(store, 'ann', annsMailbox, 'bob@private.example')).rejects.toEqual(new MailSenderRefusedError('bob@private.example'))
  })
})

describe('usableSenders', () => {
  it("lists the mailbox's own address, those entered, then others' shared ones, each once", async () => {
    const both = senderRows([row({ id: 'b1', userId: 'bob', address: 'sales@acme.example', shared: true }), row({ id: 'a1', userId: 'ann', address: 'sales@acme.example', shared: true, isDefault: true }), row({ id: 'c1', userId: 'cy', address: 'help@acme.example', shared: true })])
    expect((await usableSenders(both, 'ann', annsMailbox)).map(({ address, ownerId }) => [address, ownerId])).toEqual([
      ['Ann@gmail.example', 'ann'],
      ['sales@acme.example', 'ann'],
      ['help@acme.example', 'cy'],
    ])
  })

  it("lists the mailbox's own address once when it was entered too", async () => {
    const entered = senderRows([row({ id: 'a1', userId: 'ann', address: 'ann@gmail.example', signature: 'Ann' })])
    expect(await usableSenders(entered, 'ann', annsMailbox)).toEqual([{ address: 'ann@gmail.example', ownerId: 'ann', signature: 'Ann', shared: false }])
  })
})
