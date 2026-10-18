import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { betterAuthAuthenticator, createAuth, handleDroppedConnections } from '@protobase/server'
import { databaseUrl } from '../db/connection'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// One pool across hot reloads of this module
const store = globalThis as { __realEstateAdminPool?: pg.Pool }
store.__realEstateAdminPool ??= handleDroppedConnections(new pg.Pool({ connectionString: databaseUrl, max: 5 }))

/** The admin store (Better Auth's users, sessions and signing keys) lives in this schema, next to the example's own schemas. */
export const authSchema = 'auth'

const pool = store.__realEstateAdminPool

// Tickets name their assignee by core.users' integer id, so a new user takes the next value of that table's sequence;
// their row there comes with the account (db/migrations/013_auth_users.sql).
const nextUserId = async () => {
  const { rows } = await pool.query<{ id: string }>("select nextval(pg_get_serial_sequence('core.users', 'id'))::text as id")
  return rows[0]!.id
}

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: authSchema, transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  // No defaultRole on purpose: every account is created with an explicit role (`protobase users create --role`).
  roles: ['admin', 'manager', 'finance', 'maintenance'],
  generateUserId: nextUserId,
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** Organizations are not used yet: everyone works in organization 1. */
export const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
