import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { appPool, betterAuthAuthenticator, createAuth } from '@protobase/server'
import { databaseUrl } from '../db/connection'
import { accounts } from './accounts'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; generate one with `openssl rand -base64 32` and put it in .env')

// The app's one pool, shared with the runtime, so the store opens no connections beyond the app's
const pool = appPool(pg, databaseUrl)

export const auth = createAuth({
  database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth', transaction: true },
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret,
  ...accounts,
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean),
})

/** No organizations: a member's own rows are told apart by their user id, the token's subject. */
export const authenticate = betterAuthAuthenticator({ auth })
