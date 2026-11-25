import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { resourceEntry } from '../schema-modules/resource-difference'
import type { ModuleInput, ModuleModel, ResourceEntry, ResourceReplaceable } from '../schema-modules/schema-module'
import { captureBody, quoteIdent, type ResourceCapture } from './capture-sql'

/** The version of `capture()` this version of Protobase writes, by the replaceable that writes it. */
export const captureVersion = 1

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// A trigger's arguments are kept as bytes, each ended by a zero byte.
const triggerArgs = (hex: string) => {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))
  return new TextDecoder().decode(bytes).split('\0').slice(0, -1)
}

type FoundTrigger = { name: string; type: number; args: string[] }

// Whether `found`, the triggers on a resource's table that call `capture()`, are the ones its input makes: the same
// names, firing and arguments. An update trigger's columns are part of its `when`, which its name and arguments follow.
const sameTriggers = (found: readonly FoundTrigger[], wanted: ResourceCapture) =>
  found.length === wanted.triggers.length &&
  wanted.triggers.every((trigger) => found.some((one) => one.name === trigger.name && one.type === trigger.type && one.args.join('\0') === trigger.args.join('\0')))

const readTriggers = async (db: Db, captureOid: string, table: string) =>
  (
    await rowsOf(
      db,
      sql<{ name: string; type: number; args: string }>`select t.tgname as name, t.tgtype::int as type, encode(t.tgargs, 'hex') as args from pg_trigger t
        where not t.tgisinternal and t.tgfoid::text = ${captureOid} and t.tgrelid = to_regclass(${table})`,
    )
  ).map((trigger) => ({ ...trigger, args: triggerArgs(trigger.args) }))

/**
 * The change capture as the database has it for `input`: step 1 once the outbox is there, `capture()` at its version
 * when its body is the one this version writes, and each resource of the input whose table has triggers calling it,
 * at the digest of its input when they are the ones it makes, else at none, so they are written again. Refuses an
 * outbox of an earlier shape, which no step records.
 */
export const readCapture = (triggers: ResourceReplaceable) => async (db: Db, input: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = input.names.schema!
  const [outbox] = await rowsOf(
    db,
    sql<{ found: boolean; role: boolean }>`select to_regclass(${`${quoteIdent(schema)}."outbox"`}) is not null as found,
      exists (select from information_schema.columns where table_schema = ${schema} and table_name = 'outbox' and column_name = 'database_role') as role`,
  )
  if (!outbox!.found) return
  if (!outbox!.role) {
    throw new Error(`The outbox of the change capture in schema "${schema}" lacks its database_role column, which no step of this version of Protobase records: bring it there with \`protobase migration\` and \`protobase migrate\` of Protobase 0.14.2 first, then run this command again`)
  }
  const [capture] = await rowsOf(
    db,
    sql<{ oid: string; source: string; definer: boolean }>`select p.oid::text as oid, p.prosrc as source, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = 'capture' and p.pronargs = 0`,
  )
  const current = capture && capture.definer && capture.source === captureBody(schema)
  const entries: Record<string, ResourceEntry> = {}
  for (const [key, given] of Object.entries(capture ? (input.resources[triggers.name] ?? {}) : {})) {
    const wanted = given.input as ResourceCapture
    const found = await readTriggers(db, capture!.oid, wanted.table)
    if (found.length === 0) continue
    const entry = resourceEntry(triggers, input.names, given)
    entries[key] = sameTriggers(found, wanted) ? entry : { ...entry, digest: '' }
  }
  return {
    lastStep: 1,
    replaceables: current ? { capture: captureVersion } : {},
    names: input.names,
    ...(Object.keys(entries).length > 0 && { resources: { [triggers.name]: entries } }),
  }
}
