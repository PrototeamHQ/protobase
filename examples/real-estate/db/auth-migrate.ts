import { getMigrations } from 'better-auth/db/migration'
import type pg from 'pg'
import { auth, authSchema } from '../auth/auth'

// Better Auth creates the schema itself when it has tables to create, so this needs no more than a role that owns its database.
const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options)
await runMigrations()
console.log(`auth tables in schema ${authSchema} up to date (${toBeCreated.length} created, ${toBeAdded.length} extended)`)
await (globalThis as { __realEstateAdminPool?: pg.Pool }).__realEstateAdminPool?.end()
