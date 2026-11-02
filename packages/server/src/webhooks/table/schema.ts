import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../../changes/capture-sql'
import { migrationCommand } from '../../changes/capture-schema'
import { changesSchema, type EventsOptions } from '../../changes/events-options'
import { webhooksSchema, type WebhooksOptions } from './options'
import { commandsSql, deliveriesSql, deliveryLogIndexesSql, deliveryLogSql, subscriptionsIndexesSql, subscriptionsSql, webhooksComment } from './schema-sql'

const functionNames = ['subscription_commands', 'deliveries_resend']

// Only reads the catalogue.
const readWebhooksSchema = async (db: Db, schema: string) => {
  const exists = async (table: string) =>
    (await sql<{ found: boolean }>`select to_regclass(${`${quoteIdent(schema)}.${quoteIdent(table)}`}) is not null as found`.execute(db)).rows[0]!.found
  const { rows } = await sql<{ name: string; comment: string | null }>`select p.proname as name, obj_description(p.oid, 'pg_proc') as comment
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = any(${functionNames}::text[]) order by p.proname`.execute(db)
  return {
    subscriptions: await exists('subscriptions'),
    current: functionNames.every((name) => rows.some((row) => row.name === name && row.comment === webhooksComment)) && (await exists('deliveries')),
    deliveryLog: await exists('delivery_log'),
  }
}

/**
 * The SQL that brings the `webhooks` schema to what `webhooks` needs: the subscriptions table, its commands, the
 * deliveries view and, with `deliveryLog`, the log table. `undefined` when current. Needs the jobs schema, which the
 * deliveries view reads. Tables are never dropped.
 */
export const webhooksMigration = async (db: Db, options: WebhooksOptions = {}, events?: EventsOptions) => {
  const schema = webhooksSchema(options)
  const found = await readWebhooksSchema(db, schema)
  const needsLog = Boolean(options.deliveryLog) && !found.deliveryLog
  const current = found.subscriptions && found.current
  if (current && !needsLog) return undefined
  // Behind this version, the indexes are written again with the functions, so an earlier schema gets the ones added since.
  const statements = [
    `create schema if not exists ${quoteIdent(schema)}`,
    ...(found.subscriptions ? [] : [subscriptionsSql(schema, changesSchema(events))]),
    ...(current ? [] : [subscriptionsIndexesSql(schema), commandsSql(schema), deliveriesSql(schema)]),
    ...(needsLog ? [deliveryLogSql(schema)] : []),
    ...(needsLog || (!current && found.deliveryLog) ? [deliveryLogIndexesSql(schema)] : []),
  ]
  return `${statements.join(';\n\n')};`
}

/** Refuses to go on while the `webhooks` schema lacks what `webhooks` needs; the project's migrations add it. */
export const checkWebhooksSchema = async (db: Db, options: WebhooksOptions = {}) => {
  const schema = webhooksSchema(options)
  const found = await readWebhooksSchema(db, schema)
  if (found.subscriptions && found.current && (!options.deliveryLog || found.deliveryLog)) return
  throw new Error(`The ${schema} schema is missing or behind this version of Protobase. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
