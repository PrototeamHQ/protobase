import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
import { databaseUrl } from '../db/connection'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// One pool across hot reloads of this module
const store = globalThis as { __propertyPortalAdminPool?: pg.Pool }
store.__propertyPortalAdminPool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 })

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool: store.__propertyPortalAdminPool }), type: 'postgres', schemaName: 'auth', transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  // Accounts are members unless created with another role (`protobase users create --role admin`).
  roles: ['admin', 'member'],
  defaultRole: 'member',
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** No organizations: a member's own rows are told apart by their user id, the token's subject. */
export const authenticate = betterAuthAuthenticator({ auth })
