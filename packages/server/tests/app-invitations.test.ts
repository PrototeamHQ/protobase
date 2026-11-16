import { describe, expect, it } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { createAppInvitation, deleteAppInvitation, findAppInvitation, findAppInvitationOf, listAppInvitations } from '../src/better-auth/users/app-invitation-store'
import { openSnapshotDb, settled } from '../../../test-support/sql-snapshot'

const day = 24 * 60 * 60
// The snapshot tests' clock, which the app reads, as SQL: Postgres's own clock runs on.
const at = `timestamptz '2026-08-01 00:00:00+00'`

const contextOn = async () => {
  const store = await openSnapshotDb('auth')
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:5173', secret: 'test-secret-test-secret-test-secret-1234', mailer: false })
  // Its schema check, which starts once its context is made, finishes before the test's queries.
  const context = (await auth.$context) as unknown as AuthContext
  await settled()
  return { store, context }
}

const invite = (context: AuthContext, email: string, roles: string[], seconds = 7 * day) => createAppInvitation(context, { email, roles, inviterId: 'root' }, seconds)

describe('app invitations', () => {
  it('are stored as verification rows and found by id, with the address in lower case', async () => {
    const { store, context } = await contextOn()
    const invitation = await invite(context, 'Ana@Example.com', ['sales'])
    expect((await store.query<{ identifier: string }>('select identifier from verification')).rows).toEqual([{ identifier: `app-invitation:${invitation.id}` }])
    expect(await findAppInvitation(context, invitation.id)).toEqual({ ...invitation, email: 'ana@example.com' })
    expect(await listAppInvitations(context)).toEqual([invitation])
    await deleteAppInvitation(context, invitation.id)
    expect(await findAppInvitation(context, invitation.id)).toBeUndefined()
  })

  it('replace every earlier invitation of the same address, however many there are', async () => {
    const { store, context } = await contextOn()
    const first = await invite(context, 'ana@example.com', ['sales'])
    const other = await invite(context, 'bo@example.com', ['user'])
    // More earlier rows for the address than the 100 a read returns untold.
    await store.query(`insert into verification (id, identifier, value, expires_at, created_at, updated_at)
      select 'old-' || i, 'app-invitation:old-' || i, '{"email":"ana@example.com","roles":["user"],"inviterId":"root"}', ${at} + interval '1 day', ${at}, ${at}
      from generate_series(1, 150) i`)
    const again = await invite(context, 'ANA@example.com', ['admin'])
    expect(await findAppInvitation(context, first.id)).toBeUndefined()
    expect((await listAppInvitations(context)).map((invitation) => [invitation.email, invitation.roles])).toEqual([['bo@example.com', ['user']], ['ana@example.com', ['admin']]])
    expect(again.id).not.toBe(other.id)
  })

  it('are found by address, whatever its case', async () => {
    const { context } = await contextOn()
    await invite(context, 'bo@example.com', ['user'])
    const invitation = await invite(context, 'ana@example.com', ['sales'])
    expect(await findAppInvitationOf(context, 'Ana@Example.com')).toEqual(invitation)
    expect(await findAppInvitationOf(context, 'cy@example.com')).toBeUndefined()
  })

  it('stop being listed or found once they expire', async () => {
    const { context } = await contextOn()
    const invitation = await invite(context, 'ana@example.com', ['sales'], -1)
    expect(await listAppInvitations(context)).toEqual([])
    expect(await findAppInvitation(context, invitation.id)).toBeUndefined()
    expect(await findAppInvitationOf(context, 'ana@example.com')).toBeUndefined()
  })

  it('are listed whole, oldest first, past the 100 rows a read returns untold, without the expired ones', async () => {
    const { store, context } = await contextOn()
    await store.query(`insert into verification (id, identifier, value, expires_at, created_at, updated_at)
      select 'v' || i, 'app-invitation:i' || lpad(i::text, 3, '0'), '{"email":"user' || i || '@example.com","roles":["user"],"inviterId":"root"}',
        ${at} + case when i % 2 = 0 then interval '1 day' else interval '-1 day' end, ${at} + i * interval '1 second', ${at}
      from generate_series(1, 300) i`)
    const listed = await listAppInvitations(context)
    expect(listed).toHaveLength(150)
    expect([listed[0]!.id, listed.at(-1)!.id]).toEqual(['i002', 'i300'])
  })
})
