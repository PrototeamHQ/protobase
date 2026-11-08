import { randomBytes } from 'node:crypto'
import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { RelayBinding, RelayStore } from './store'

type BindingRow = { handle: string; kind: 'apns' | 'fcm'; token: string; environment: 'sandbox' | 'production' | null; origin: string }

const bindingOf = (row: BindingRow) => ({ handle: row.handle, kind: row.kind, token: row.token, environment: row.environment, origin: row.origin }) as RelayBinding

/** A new handle: 32 random bytes in base64url, nothing of the token. */
export const newHandle = () => randomBytes(32).toString('base64url')

/** The relay's store on the `push_relay` tables `protobase migration` writes. */
export const postgresRelayStore = (db: Db): RelayStore => ({
  register: async ({ kind, token, environment, origin }) => {
    // The token's handle for the origin stays; only its environment follows the latest registration.
    const { rows } = await sql<{ handle: string }>`insert into push_relay.handles (handle, kind, token, environment, origin, created_at)
      values (${newHandle()}, ${kind}, ${token}, ${environment}, ${origin}, now())
      on conflict (token, origin) do update set kind = excluded.kind, environment = excluded.environment
      returning handle`.execute(db)
    return rows[0]!.handle
  },

  bindings: async (handles) => {
    if (handles.length === 0) return []
    const { rows } = await sql<BindingRow>`select handle, kind, token, environment, origin from push_relay.handles where handle = any(${[...handles]}::text[])`.execute(db)
    return rows.map(bindingOf)
  },

  removeHandles: async (handles) => {
    if (handles.length === 0) return
    await sql`delete from push_relay.handles where handle = any(${[...handles]}::text[])`.execute(db)
  },

  credential: async (id) => {
    const { rows } = await sql<{ id: string; origin: string; secret_hash: Buffer }>`select id, origin, secret_hash from push_relay.credentials where id = ${id}::uuid`.execute(db)
    const row = rows[0]
    return row && { id: row.id, origin: row.origin, secretHash: Buffer.from(row.secret_hash) }
  },

  charge: async (id, devices, perHour) => {
    // One statement: a new clock hour starts the count again, and a count it would take over the limit changes nothing.
    const { rows } = await sql<{ id: string }>`update push_relay.credentials
      set sent = case when hour = date_trunc('hour', now()) then sent + ${devices} else ${devices} end, hour = date_trunc('hour', now())
      where id = ${id}::uuid and (case when hour = date_trunc('hour', now()) then sent + ${devices} else ${devices} end) <= ${perHour}
      returning id`.execute(db)
    return rows.length === 1
  },

  addCredential: async ({ id, origin, secretHash }) => {
    await sql`insert into push_relay.credentials (id, origin, secret_hash, created_at) values (${id}::uuid, ${origin}, ${secretHash}, now())`.execute(db)
  },

  removeCredential: async (id) => {
    const { rows } = await sql<{ id: string }>`delete from push_relay.credentials where id = ${id}::uuid returning id`.execute(db)
    return rows.length === 1
  },

  listCredentials: async () => {
    const { rows } = await sql<{ id: string; origin: string; created_at: Date }>`select id, origin, created_at from push_relay.credentials order by created_at, id`.execute(db)
    return rows.map((row) => ({ id: row.id, origin: row.origin, createdAt: new Date(row.created_at) }))
  },
})
