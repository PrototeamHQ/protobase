import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
import { databaseUrl } from '../db/connection'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// One pool across hot reloads of this module
const store = globalThis as { __realEstateAdminPool?: pg.Pool }
store.__realEstateAdminPool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 })

/** The admin store (Better Auth's users, sessions and signing keys) lives in this schema, next to the example's own schemas. */
export const authSchema = 'auth'

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool: store.__realEstateAdminPool }), type: 'postgres', schemaName: authSchema, transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  // No defaultRole on purpose: every account is created with an explicit role (`protobase users create --role`).
  roles: ['admin', 'manager', 'finance', 'maintenance'],
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** Organizations are not used yet: everyone works in organization 1. */
export const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
