import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../../changes/capture-sql'
import type { TenantValue } from '../../types'
import type { AttemptResult } from '../attempt'
import type { SubscriptionDefinition, SubscriptionEvent } from '../subscription'
import { parseEvents, tableSubscriptionName } from './options'

type Row = {
  id: string
  events: string
  url: string
  filter: string | null
  headers: Record<string, string> | null
  payload: 'full' | 'thin'
  enabled: boolean
  secret: string
  previous_secret: string | null
  overlapping: boolean
  tenant_id: string | null
  owner_id: string | null
}

/** A UI subscription is disabled after this long without a success. */
const failingFor = '3 days'

// A row's id is a uuid, compared as one so its primary key finds it; any other id names no row.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type TableSubscriptionsInput = {
  schema: string
  ownerRoles: (owner: { id: string; tenant?: TenantValue }) => Promise<string[]>
  deliveryLog: boolean
}

/**
 * The subscriptions people made in the admin app, as the dispatcher and the delivery jobs use them: named `ui:<id>`,
 * delivering as their owner with the roles they hold now, signed with their secret and, for 24 hours after a rotation,
 * the previous one too. What happens to their deliveries is kept on their row.
 */
export const tableSubscriptions = ({ schema, ownerRoles, deliveryLog }: TableSubscriptionsInput) => {
  const table = sql.raw(`${quoteIdent(schema)}."subscriptions"`)

  const definition = async (row: Row): Promise<SubscriptionDefinition> => {
    const tenant = row.tenant_id ?? undefined
    const roles = row.owner_id ? await ownerRoles({ id: row.owner_id, ...(tenant !== undefined && { tenant }) }) : []
    return {
      kind: 'subscription',
      name: tableSubscriptionName(row.id),
      options: {
        events: parseEvents(row.events),
        url: row.url,
        ...(row.filter && { when: row.filter }),
        ...(row.headers && { headers: row.headers }),
        payload: row.payload,
        enabled: row.enabled,
        secret: row.overlapping && row.previous_secret ? [row.secret, row.previous_secret] : row.secret,
        ...(tenant !== undefined && { tenant }),
        as: { roles },
      },
    }
  }

  const select = sql`select "id"::text as id, "events", "url", "filter", "headers", "payload", "enabled", "secret", "previous_secret",
    coalesce("previous_secret_until" > now(), false) as overlapping, "tenant_id", "owner_id" from ${table}`

  /** Every enabled one. */
  const load = async (db: Db) => Promise.all((await sql<Row>`${select} where "enabled"`.execute(db)).rows.map(definition))

  /** One by id, enabled or not; `undefined` once it is deleted. */
  const find = async (db: Db, id: string) => {
    if (!uuid.test(id)) return undefined
    const [row] = (await sql<Row>`${select} where "id" = ${id}::uuid`.execute(db)).rows
    return row && definition(row)
  }

  /** The row's record of a try: its last success, how long it has been failing, and disabling it when it should stop. */
  const record = async (db: Db, id: string, event: SubscriptionEvent, tried: number, result: AttemptResult, durationMs: number) => {
    if (!uuid.test(id)) return
    if (result.ok) {
      await sql`update ${table} set "last_success_at" = now(), "failing_since" = null where "id" = ${id}::uuid`.execute(db)
    } else {
      const gone = result.status === 410
      await sql`update ${table} set "failing_since" = coalesce("failing_since", now()),
          "enabled" = "enabled" and not (${gone} or coalesce("failing_since", now()) < now() - ${failingFor}::interval),
          "disabled_reason" = case
            when ${gone} then 'The receiver answered 410 Gone'
            when coalesce("failing_since", now()) < now() - ${failingFor}::interval then 'No delivery succeeded for ${sql.raw(failingFor)}'
            else "disabled_reason" end
        where "id" = ${id}::uuid`.execute(db)
    }
    if (!deliveryLog) return
    const status = result.ok ? 'delivered' : 'failed'
    const response = result.ok ? null : result.error.slice(0, 2048)
    await sql`insert into ${sql.raw(`${quoteIdent(schema)}."delivery_log"`)} ("subscription_id", "tenant_id", "event_id", "event_type", "status", "attempt", "status_code", "response", "duration_ms")
      select "id", "tenant_id", ${event.id}, ${event.type}, ${status}, ${tried}, ${result.status ?? null}, ${response}, ${Math.round(durationMs)} from ${table} where "id" = ${id}::uuid`.execute(db)
  }

  /** Deletes the log's tries older than 30 days. */
  const prune = async (db: Db) => {
    await sql`delete from ${sql.raw(`${quoteIdent(schema)}."delivery_log"`)} where "at" < now() - interval '30 days'`.execute(db)
  }

  return { load, find, record, prune, deliveryLog }
}

export type TableSubscriptions = ReturnType<typeof tableSubscriptions>
