import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { relationFound } from '../../relation-found'
import { quoteIdent } from '../../changes/capture-sql'
import { hasIndexes } from '../../has-indexes'
import type { ModuleInput, ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { commandsSql, commentVersion, deliveriesSql, subscriptionsIndexes, subscriptionsIndexesSql, subscriptionsSql, webhooksServedVersion, webhooksVersion } from './schema-sql'

const functionNames = ['subscription_commands', 'deliveries_resend']

const upgradeFirst = 'with `protobase migration` and `protobase migrate` of Protobase 0.14.2 first, then run this command again'

/**
 * The functions' version, from the oldest version their comments name, `undefined` when one of them or the deliveries
 * view is missing, so they are written again as new. Refuses a version newer than this version of Protobase writes.
 */
const readFunctions = async (db: Db, schema: string): Promise<Record<string, number>> => {
  const { rows } = await sql<{ name: string; comment: string | null }>`select p.proname as name, obj_description(p.oid, 'pg_proc') as comment
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = any(${functionNames}::text[])`.execute(db)
  const versions = functionNames.map((name) => commentVersion(rows.find((row) => row.name === name)?.comment ?? null))
  const newest = Math.max(...versions.filter((version) => version !== undefined))
  if (newest > webhooksVersion) throw new Error(`The functions of the ${schema} schema are at version ${newest}, newer than the ${webhooksVersion} this version of Protobase writes: upgrade Protobase`)
  if (!(await relationFound(db, `${quoteIdent(schema)}."deliveries"`)) || versions.some((version) => version === undefined)) return {}
  return { functions: Math.min(...(versions as number[])) }
}

/**
 * The webhooks schema as the database has it: step 1 once the subscriptions table is there with every index, and its
 * functions at the version their comments name. Refuses a table without those indexes, as version 1 wrote it, which no
 * step records.
 */
const readWebhooks = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  if (!(await relationFound(db, `${quoteIdent(schema)}."subscriptions"`))) return
  if (!(await hasIndexes(db, schema, 'subscriptions', subscriptionsIndexes))) {
    throw new Error(`The subscriptions table in schema "${schema}" lacks indexes no step of this version of Protobase records: add them ${upgradeFirst}`)
  }
  return { lastStep: 1, replaceables: await readFunctions(db, schema), names }
}

/**
 * The webhook subscriptions made in the admin app, in the schema `webhooks` names (`names.schema`): the subscriptions
 * table, whose owner the change capture's actor setting in schema `names.changes` gives, and its commands and the
 * deliveries view over the jobs schema. Its tables are never dropped.
 */
export const webhooksSchemaModule: SchemaModule = {
  label: 'the webhooks schema',
  title: 'The webhook subscriptions of webhooks',
  steps: [
    {
      step: 1,
      name: 'subscriptions',
      title: 'The subscriptions table and its indexes',
      additive: true,
      sql: (names) => `create schema if not exists ${quoteIdent(names.schema!)};\n${subscriptionsSql(names.schema!, names.changes!)};\n${subscriptionsIndexesSql(names.schema!)};`,
    },
  ],
  // A schema whose functions are at an older version this one still serves on starts: they only lack what speeds reads up.
  replaceables: [
    {
      name: 'functions',
      title: "The subscriptions' commands and the deliveries view",
      version: webhooksVersion,
      compatibleFrom: webhooksServedVersion,
      sql: (names) => `${commandsSql(names.schema!)};\n\n${deliveriesSql(names.schema!)};`,
    },
  ],
  resourceReplaceables: [],
  read: readWebhooks,
}
