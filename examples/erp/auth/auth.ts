import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
import { databaseUrl } from '../db/connection'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// One pool across hot reloads of this module
const store = globalThis as { __erpAdminPool?: pg.Pool }
store.__erpAdminPool ??= new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL ?? databaseUrl, max: 5 })

/** The admin store (Better Auth's users, sessions and signing keys) lives in this schema, next to the ERP's own schemas. */
export const authSchema = 'auth'

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool: store.__erpAdminPool }), type: 'postgres', schemaName: authSchema, transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  // No defaultRole on purpose: every account is created with an explicit role (`protobase users create --role`).
  roles: ['admin', 'auditor', 'manager', 'sales', 'accountant', 'warehouse', 'editor', 'integration'],
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** Organizations are not used yet: everyone works in organization 1. */
export const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
