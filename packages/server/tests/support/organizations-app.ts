import { decodeJwt } from 'jose'
import { afterAll, beforeAll, expect } from 'vitest'
import { betterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../../src/better-auth/create-auth'
import { addMember, createOrganization } from '../../src/better-auth/organizations/host'
import { createUser } from '../../src/better-auth/users'
import { createAdmin } from '../../src/create-admin'
import type { AuditEvent } from '../../src/types'
import { allResources, createFixtureDb } from '../../../../test-support/server'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../../test-support/sql-snapshot'

// The app with organizations the organization tests share, each test file with recordings of its own.

export const origin = 'http://localhost:5173'
export const secret = 'test-secret-test-secret-test-secret-1234'
export const password = 'correct horse battery'

// The fixture's tenant columns are integers holding 1 and 2, so the organizations get those ids.
const roles: CreateAuthOptions['roles'] = {
  support: 'Support',
  manager: { label: 'Manager', grants: ['accountant'] },
  sales: 'Sales',
  accountant: 'Accountant',
}

// Made, then given the time to check its schema in the background, so its queries come before the test's.
const authOn = async (store: SnapshotDb, ids: string[], options: Partial<CreateAuthOptions> = {}) => {
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: false,
    signInPerMinute: 100,
    roles,
    organizations: { default: { id: 'default', name: 'Default', slug: 'default' }, generateId: () => ids.shift()!, create: 'everyone' },
    ...options,
  })
  // The check starts once its context is made, which a busy machine can take longer for than settled() waits.
  await auth.$context
  await settled()
  return auth
}

/** Root (superuser), Bo (owns Acme), Sanne (sales in Acme), Ana (global support, in no organization). */
const people = async (auth: ReturnType<typeof createAuth>) => {
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'bo@example.com', password })
  await createUser(auth, { email: 'sanne@example.com', password })
  await createUser(auth, { email: 'ana@example.com', password, role: 'support' })
  await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'bo@example.com' })
  await createOrganization(auth, { name: 'Globex', slug: 'globex', owner: 'root@example.com' })
  await addMember(auth, { organization: 'acme', email: 'sanne@example.com', appRoles: ['sales'] })
}

/**
 * Opens, for the test file that calls it, the migrated auth store and a copy of it with the people above in it, made
 * once: hashing their passwords and making their organizations is most of what the tests would repeat. Returns `serve`.
 */
export const organizationsApp = () => {
  let fixture: Awaited<ReturnType<typeof createFixtureDb>>
  let migrated: SnapshotDb
  let peopled: SnapshotDb
  beforeAll(async () => {
    fixture = await createFixtureDb()
    migrated = await openSnapshotDb('auth')
    peopled = await migrated.clone()
    await people(await authOn(peopled, ['1', '2']))
  })
  afterAll(async () => { await fixture.db.destroy() })

  let client = 0

  /** An app with organizations on a copy of the migrated auth store, with the people above in it when `people` says so. */
  const serve = async (options: Partial<CreateAuthOptions> = {}, { people = false } = {}) => {
    const store = await (people ? peopled : migrated).clone()
    const auth = await authOn(store, people ? ['3'] : ['1', '2', '3'], options)
    const audited: AuditEvent[] = []
    const audit = { publish: async (event: AuditEvent) => void audited.push(event) }
    const app = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth }), auth, options: { audit } })
    const address = `198.51.100.${++client}`
    const request = (path: string, init: { body?: unknown; cookie?: string; token?: string; headers?: Record<string, string> } = {}) =>
      app.request(`${origin}${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-forwarded-for': address,
          ...(init.cookie && { cookie: init.cookie }),
          ...(init.token && { authorization: `Bearer ${init.token}` }),
          ...init.headers,
        },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      })
    const signIn = async (email: string) => {
      const response = await request('/api/auth/sign-in/email', { body: { email, password } })
      expect(response.status).toBe(200)
      return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    }
    const tokenOf = async (cookie: string) => ((await (await request('/api/auth/token', { cookie })).json()) as { token: string }).token
    return { auth, store, audited, request, signIn, tokenOf }
  }

  return { serve, migrated: () => migrated }
}

export type OrganizationsApp = Awaited<ReturnType<ReturnType<typeof organizationsApp>['serve']>>

export const claimsOf = async (app: OrganizationsApp, cookie: string) => decodeJwt(await app.tokenOf(cookie))

/** The id of the invitation a link's token names. */
export const invitationIdFrom = (token: string) => token.slice(0, token.lastIndexOf('.'))
