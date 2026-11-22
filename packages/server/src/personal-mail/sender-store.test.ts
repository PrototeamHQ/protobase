import { describe, expect, it, vi } from 'vitest'
import { adapterSenderStore, type MailSenderRow } from './sender-store'

type FindMany = (query: { model: string; where?: { field: string; value: unknown; operator?: string }[] }) => Promise<unknown[]>

const created = new Date('2026-10-01T09:00:00Z')
const row = (userId: string, address: string): MailSenderRow => ({ id: `${userId}-${address}`, userId, address, shared: true, isDefault: false, createdAt: created, verifiedAccountId: `acc-${userId}`, verifiedAt: created })

// An adapter that answers memberships and the shared rows the query names, recording each query.
const adapterOf = (members: { userId: string; organizationId: string }[], rows: MailSenderRow[]) => {
  const findMany = vi.fn<FindMany>(async ({ model, where = [] }) => {
    if (model === 'member') {
      const [{ field, value }] = where as [{ field: string; value: unknown }]
      return members.filter((member) => (Array.isArray(value) ? value.includes(member[field as 'organizationId']) : member[field as 'userId'] === value))
    }
    const owners = where.find((condition) => condition.field === 'userId')?.value as string[] | undefined
    return rows.filter((candidate) => !owners || owners.includes(candidate.userId))
  })
  return { findMany }
}

describe('the shared addresses sending reads', () => {
  it('asks only for shared rows a check proved, latest first, of the people in an organization with the sender, and leaves out their own', async () => {
    const adapter = adapterOf(
      [
        { userId: 'ann', organizationId: 'o1' },
        { userId: 'bob', organizationId: 'o1' },
        { userId: 'cy', organizationId: 'o2' },
      ],
      [row('ann', 'team@acme.example'), row('bob', 'sales@acme.example'), row('cy', 'ops@other.example')],
    )
    const store = adapterSenderStore(async () => adapter as never, true)
    expect((await store.sharedWith('ann')).map((shared) => shared.address)).toEqual(['sales@acme.example'])
    expect(adapter.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: 'mailSender',
        where: [
          { field: 'shared', value: true },
          { field: 'verifiedAccountId', operator: 'ne', value: null },
          { field: 'userId', operator: 'in', value: ['ann', 'bob'] },
        ],
        sortBy: { field: 'verifiedAt', direction: 'desc' },
      }),
    )
  })

  it('reaches no one but the sender for a person in no organization', async () => {
    const adapter = adapterOf([], [row('bob', 'sales@acme.example')])
    expect(await adapterSenderStore(async () => adapter as never, true).sharedWith('ann')).toEqual([])
  })

  it("reaches everyone's in an app without organizations", async () => {
    const adapter = adapterOf([], [row('bob', 'sales@acme.example')])
    expect((await adapterSenderStore(async () => adapter as never, false).sharedWith('ann')).map((shared) => shared.userId)).toEqual(['bob'])
    expect(adapter.findMany).toHaveBeenCalledTimes(1)
  })
})
