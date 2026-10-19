import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthContext } from '../organizations/store'
import { createAppInvitation, deleteAppInvitation, findAppInvitation, listAppInvitations } from './app-invitation-store'

type Row = { identifier: string; value: string; expiresAt: Date; createdAt: Date }

// The verification calls the store makes, on an array.
const fakeContext = () => {
  const rows: Row[] = []
  const context = {
    adapter: {
      findMany: async ({ where }: { where: { value: string }[] }) => rows.filter((row) => row.identifier.startsWith(where[0]!.value)),
    },
    internalAdapter: {
      createVerificationValue: async (data: Omit<Row, 'createdAt'>) => void rows.push({ ...data, createdAt: new Date() }),
      findVerificationValue: async (identifier: string) => rows.find((row) => row.identifier === identifier) ?? null,
      deleteVerificationByIdentifier: async (identifier: string) => void rows.splice(rows.findIndex((row) => row.identifier === identifier), 1),
    },
  }
  return { rows, context: context as unknown as AuthContext }
}

const day = 24 * 60 * 60

afterEach(() => { vi.useRealTimers() })

describe('app invitations', () => {
  it('are stored as verification rows and found by id, with the address in lower case', async () => {
    const { rows, context } = fakeContext()
    const invitation = await createAppInvitation(context, { email: 'Ana@Example.com', roles: ['sales'], inviterId: 'root' }, 7 * day)
    expect(rows.map((row) => row.identifier)).toEqual([`app-invitation:${invitation.id}`])
    expect(await findAppInvitation(context, invitation.id)).toEqual({ ...invitation, email: 'ana@example.com' })
    expect(await listAppInvitations(context)).toEqual([invitation])
    await deleteAppInvitation(context, invitation.id)
    expect(await findAppInvitation(context, invitation.id)).toBeUndefined()
  })

  it('replace an earlier invitation of the same address', async () => {
    const { context } = fakeContext()
    const first = await createAppInvitation(context, { email: 'ana@example.com', roles: ['sales'], inviterId: 'root' }, 7 * day)
    const other = await createAppInvitation(context, { email: 'bo@example.com', roles: ['user'], inviterId: 'root' }, 7 * day)
    const again = await createAppInvitation(context, { email: 'ANA@example.com', roles: ['admin'], inviterId: 'root' }, 7 * day)
    expect(await findAppInvitation(context, first.id)).toBeUndefined()
    expect((await listAppInvitations(context)).map((invitation) => [invitation.email, invitation.roles])).toEqual([['bo@example.com', ['user']], ['ana@example.com', ['admin']]])
    expect(again.id).not.toBe(other.id)
  })

  it('stop being listed or found once they expire', async () => {
    const { context } = fakeContext()
    const invitation = await createAppInvitation(context, { email: 'ana@example.com', roles: ['sales'], inviterId: 'root' }, day)
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + day * 1000 + 1 })
    expect(await listAppInvitations(context)).toEqual([])
    expect(await findAppInvitation(context, invitation.id)).toBeUndefined()
  })
})
