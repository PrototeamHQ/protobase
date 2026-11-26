import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { resourceEntry } from '../schema-modules/resource-difference'
import type { ModuleInput, ModuleModel, ResourceEntry, ResourceReplaceable, TableName } from '../schema-modules/schema-module'
import { captureBody, quoteIdent, rowsDiffer, type ResourceCapture, type TriggerSpec } from './capture-sql'

/** The version of `capture()` this version of Protobase writes, by the replaceable that writes it. */
export const captureVersion = 1

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// A trigger's arguments are kept as bytes, each ended by a zero byte.
const triggerArgs = (hex: string) => {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))
  return new TextDecoder().decode(bytes).split('\0').slice(0, -1)
}

type FoundTrigger = { schema: string; table: string; name: string; type: number; args: string[]; enabled: boolean; when: string }

// A trigger's condition as text to compare, whether Postgres wrote it back or Protobase writes it (`rowsDiffer`): without
// case, quotes, parentheses and spaces. One Postgres words otherwise does not compare equal, and is written again.
const comparable = (condition: string) => condition.toLowerCase().replace(/["()\s]/g, '')

// The condition `trigger` fires on: an update's, none for inserts and deletes.
const condition = (trigger: TriggerSpec) => (trigger.type & 16 ? rowsDiffer(trigger.columns) : '')

// Whether `found`, the triggers on a resource's table that call `capture()`, are the ones its input makes: the same
// names, firing, condition and arguments, and enabled.
const sameTriggers = (found: readonly FoundTrigger[], wanted: ResourceCapture) =>
  found.length === wanted.triggers.length &&
  wanted.triggers.every((trigger) => found.some((one) => one.enabled && one.name === trigger.name && one.type === trigger.type && one.args.join('\0') === trigger.args.join('\0') && comparable(one.when) === comparable(condition(trigger))))

// Every trigger calling `capture()`, with the table it is on, in one read.
const readTriggers = async (db: Db, captureOid: string): Promise<FoundTrigger[]> =>
  (
    await rowsOf(
      db,
      sql<{ schema: string; table: string; name: string; type: number; args: string; enabled: boolean; when: string }>`select n.nspname as schema, c.relname as table, t.tgname as name,
        t.tgtype::int as type, encode(t.tgargs, 'hex') as args, t.tgenabled <> 'D' as enabled,
        coalesce(substring(pg_get_triggerdef(t.oid) from ' WHEN (.*) EXECUTE FUNCTION '), '') as when
        from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal and t.tgfoid::text = ${captureOid} order by n.nspname, c.relname, t.tgname`,
    )
  ).map((trigger) => ({ ...trigger, args: triggerArgs(trigger.args) }))

// Whether `found` is on the table a resource's input names: by name, and by schema when the input names one.
const onTable = (found: FoundTrigger, table: TableName) => found.table === table.name && (table.schema === undefined || found.schema === table.schema)

/**
 * The change capture as the database has it for `input`: step 1 once the outbox is there, `capture()` at its version
 * when its body is the one this version writes, and each resource of the input whose table has triggers calling it,
 * at the digest of its input when they are the ones it makes, enabled, else at none, so they are written again; and the
 * triggers on other tables, by the resource they capture (`readTriggers`). Refuses an outbox of an earlier shape, which
 * no step records.
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
    throw new Error(`The outbox of the change capture in schema "${schema}" lacks its database_role column, which no step of this version of Protobase records`)
  }
  const [capture] = await rowsOf(
    db,
    sql<{ oid: string; source: string; definer: boolean }>`select p.oid::text as oid, p.prosrc as source, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${schema} and p.proname = 'capture' and p.pronargs = 0`,
  )
  const current = capture && capture.definer && capture.source === captureBody(schema)
  const found = capture ? await readTriggers(db, capture.oid) : []
  const entries: Record<string, ResourceEntry> = {}
  for (const [key, given] of Object.entries(input.resources[triggers.name] ?? {})) {
    const own = found.filter((one) => onTable(one, given.table))
    if (own.length === 0) continue
    const entry = resourceEntry(triggers, input.names, given)
    entries[key] = sameTriggers(own, given.input as ResourceCapture) ? entry : { ...entry, digest: '' }
  }
  // Triggers on a table no resource of the input has, recorded by the resource they capture, which is their first
  // argument, at no digest: kept while another resource is captured, and dropped once none is.
  for (const one of found) {
    const resource = one.args[0] ?? one.name
    if (entries[resource] || Object.values(input.resources[triggers.name] ?? {}).some((given) => onTable(one, given.table))) continue
    entries[resource] = { version: triggers.version, digest: '', table: { schema: one.schema, name: one.table } }
  }
  return {
    lastStep: 1,
    replaceables: current ? { capture: captureVersion } : {},
    names: input.names,
    ...(Object.keys(entries).length > 0 && { resources: { [triggers.name]: entries } }),
  }
}
