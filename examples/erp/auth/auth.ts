import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
import { databaseUrl } from '../db/connection'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// One pool across hot reloads of this module
const store = globalThis as { __erpAdminPool?: pg.Pool }
store.__erpAdminPool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 })

/** The admin store (Better Auth's users, sessions and signing keys) lives in this schema, next to the ERP's own schemas. */
export const authSchema = 'auth'

const pool = store.__erpAdminPool

// The ERP's records name their organization by core.organizations' integer id, so a new organization takes the next
// value of that table's sequence, and gets its row there with the ERP's own settings once it is made.
const nextOrganizationId = async () => {
  const { rows } = await pool.query<{ id: string }>("select nextval(pg_get_serial_sequence('core.organizations', 'id'))::text as id")
  return rows[0]!.id
}

const addOrganizationRow = async ({ organization }: { organization: { id: string; name: string; slug: string } }) => {
  await pool.query(
    "insert into core.organizations (id, name, slug, country_code, currency_code) values ($1, $2, $3, 'NL', 'EUR') on conflict (id) do nothing",
    [Number(organization.id), organization.name, organization.slug],
  )
}

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: authSchema, transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  // `admin` is the superuser, in every organization; the others are held per organization (or globally, by a few).
  roles: {
    admin: 'Superuser',
    auditor: 'Auditor',
    manager: { label: 'Manager', grants: ['sales', 'accountant', 'warehouse', 'editor'] },
    sales: 'Sales',
    accountant: 'Accountant',
    warehouse: 'Warehouse',
    editor: 'Editor',
    integration: 'Integration',
  },
  organizations: {
    generateId: nextOrganizationId,
    onCreated: addOrganizationRow,
    hooks: {
      afterUpdateOrganization: async ({ organization }) => {
        if (organization) await pool.query('update core.organizations set name = $2, slug = $3 where id = $1', [Number(organization.id), organization.name, organization.slug])
      },
    },
  },
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** The organization comes from the signed-in person's session: the one they work in. */
export const authenticate = betterAuthAuthenticator({ auth })
