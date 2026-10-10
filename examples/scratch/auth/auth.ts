import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
import { databaseUrl } from '../db/connection'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// One pool across hot reloads of this module
const store = globalThis as { __adminPool?: pg.Pool }
store.__adminPool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 })

/** The admin store (Better Auth's users, sessions and signing keys) lives in this schema, next to the app's own schemas. */
export const authSchema = 'auth'

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool: store.__adminPool }), type: 'postgres', schemaName: authSchema, transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  // No defaultRole on purpose: every account is created with an explicit role (`protobase users create --role`).
  roles: ['admin'],
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** Every user works in tenant 1, which access rules can compare with an organization_id column. */
export const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
