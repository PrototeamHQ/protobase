import type { ResourceModel } from '@protobase/schema'
import { jobsSchema } from '../jobs/schema'

export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`

const quoteLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`

const qualified = ({ schema, name }: { schema?: string; name: string }) => (schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name))

/** A Postgres array literal of text, every element quoted, so the same columns always give the same text. */
const textArray = (items: string[]) => `{${items.map((item) => `"${item.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`

/** A name as Postgres keeps it: the whole characters within its first 63 bytes, or within `bytes`. */
export const identifier = (name: string, bytes = 63) => {
  const encoder = new TextEncoder()
  let kept = ''
  for (const char of name) {
    if (encoder.encode(kept + char).length > bytes) break
    kept += char
  }
  return kept
}

/** The table as SQL names it, qualified when the resource names a schema. */
export const tableSql = (model: ResourceModel) => qualified(model.table)

/**
 * Whether a resource's own declarations need its changes captured: its events, history, live updates or derived values.
 * Live updates from the resources it reads (`.live({ reads })`) need theirs instead, as a view takes no trigger.
 */
export const isCaptured = (model: ResourceModel) => (model.events ?? []).length > 0 || model.history === true || (model.live === true && !model.liveReads) || (model.derived ?? []).length > 0

/**
 * Whether the triggers capture a resource's changes among `models`: for its own declarations, or as a resource another's
 * derived values or live updates read.
 */
export const capturedBy = (models: readonly ResourceModel[]) => {
  const read = new Set(models.flatMap((model) => [...(model.derived ?? []).flatMap((value) => value.reads), ...(model.liveReads ?? [])]))
  return (model: ResourceModel) => isCaptured(model) || read.has(model.name)
}

/** The job that turns captured changes into events and deliveries: one per writing transaction, run one at a time. */
export const dispatchJobName = 'changes.dispatch'

/** Every dispatch job's group in its ordered queue, so only one runs at a time, across processes too. */
export const dispatchGroup = 'changes'

/**
 * The body of `capture()`: its arguments are the resource, the columns to keep and the sensitive columns, whose names
 * it lists when they change but whose values it never keeps. It keeps the writing role: the one `set role` chose, else
 * the session's, since the function itself runs as its owner. It skips a transaction that set `<schema>.capture` to
 * `off`, and an update that changed none of those columns. The first row a transaction captures enqueues a dispatch
 * job in the same transaction; `<schema>.dispatch` remembers that for the rest of it, and a rolled-back savepoint
 * forgets it with the job.
 */
export const captureBody = (schema: string) => `
declare
  kept text[] := TG_ARGV[1]::text[];
  hidden text[] := TG_ARGV[2]::text[];
  old_row jsonb;
  new_row jsonb;
  changed text[];
begin
  if current_setting('${schema}.capture', true) = 'off' then
    return null;
  end if;
  if TG_OP <> 'INSERT' then
    old_row := to_jsonb(OLD);
  end if;
  if TG_OP <> 'DELETE' then
    new_row := to_jsonb(NEW);
  end if;
  if TG_OP = 'UPDATE' then
    select array_agg(c.name order by c.position) into changed
    from unnest(kept || hidden) with ordinality as c(name, position)
    where old_row -> c.name is distinct from new_row -> c.name;
    if changed is null then
      return null;
    end if;
  end if;
  insert into ${quoteIdent(schema)}."outbox" ("transaction", "resource", "op", "old", "new", "changed", "actor", "database_role")
  values (
    pg_current_xact_id()::text::bigint,
    TG_ARGV[0],
    TG_OP,
    (select jsonb_object_agg(o.key, o.value) from jsonb_each(old_row) as o where o.key = any(kept)),
    (select jsonb_object_agg(n.key, n.value) from jsonb_each(new_row) as n where n.key = any(kept)),
    changed,
    nullif(current_setting('${schema}.actor', true), '')::jsonb,
    coalesce(nullif(current_setting('role'), 'none'), session_user)
  );
  if current_setting('${schema}.dispatch', true) is distinct from 'queued' then
    perform ${jobsSchema}.enqueue('${dispatchJobName}', null, null, null, '${dispatchGroup}');
    perform set_config('${schema}.dispatch', 'queued', true);
  end if;
  return null;
end
`

/**
 * `capture()` runs as its owner, with a fixed search path: a writer needs no rights on the schema, so another
 * service writing as its own role keeps working once a resource has events.
 */
export const captureFunctionSql = (schema: string) =>
  `create or replace function ${quoteIdent(schema)}."capture"() returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $capture$${captureBody(schema)}$capture$`

/**
 * A trigger as the database should have it: tgtype bits are row (1), insert (4), delete (8) and update (16). `columns`
 * are the ones an update must change to fire it; without them, any column.
 */
export type TriggerSpec = { name: string; type: number; args: string[]; columns?: string[] }

type Field = ResourceModel['fields'][string]

/** The columns that hold fields, each once: a relation's are the ones holding the other record's key. */
const columnsOf = (fields: Field[]) => [...new Set(fields.flatMap((field) => field.relation?.columns ?? [field.column]))]

// A name ending in `suffix` within Postgres's 63 bytes: a long table name is cut, never the suffix, so the two triggers
// of one table keep names of their own.
const suffixed = (name: string, suffix: string) => `${identifier(name, 63 - new TextEncoder().encode(suffix).length)}${suffix}`

/** The names of the two triggers on `table`: inserts and deletes, and updates. */
export const triggerNames = (table: { name: string }) => [suffixed(table.name, '_changes'), suffixed(table.name, '_changes_update')]

/**
 * The names an earlier version gave the triggers of a table whose name is too long for them, cut at 63 bytes so both
 * were one name, that `triggerNames` no longer gives: dropped before the triggers are made.
 */
const cutNames = (table: { name: string }) => [...new Set([identifier(`${table.name}_changes`), identifier(`${table.name}_changes_update`)])].filter((name) => !triggerNames(table).includes(name))

/**
 * The two triggers of a resource whose changes are captured: inserts and deletes, and updates that change the row. The
 * fields history ignores are left out of both, and an update fires only when it changes another's columns.
 */
export const resourceTriggers = (model: ResourceModel): TriggerSpec[] => {
  const ignored = model.historyIgnore ?? []
  const fields = Object.values(model.fields).filter((field) => !ignored.includes(field.name))
  const args = [model.name, textArray(columnsOf(fields.filter((field) => !field.sensitive))), textArray(columnsOf(fields.filter((field) => field.sensitive)))]
  const [insertDelete, updateName] = triggerNames(model.table)
  const update = { name: updateName!, type: 1 | 16, args }
  return [
    { name: insertDelete!, type: 1 | 4 | 8, args },
    ignored.length > 0 ? { ...update, columns: columnsOf(fields) } : update,
  ]
}

export const dropTriggerSql = (name: string, table: string) => `drop trigger if exists ${quoteIdent(name)} on ${table}`

/**
 * The condition an update must meet to fire a trigger that names `columns`: any column changed without them. Each
 * column is compared on its own, as Postgres words a row comparison back, so the catalogue's condition reads the same.
 */
export const rowsDiffer = (columns?: string[]) => {
  if (!columns) return 'old.* is distinct from new.*'
  return columns.map((column) => `(old.${quoteIdent(column)} is distinct from new.${quoteIdent(column)})`).join(' or ')
}

export const createTriggerSql = (schema: string, trigger: TriggerSpec, table: string) => {
  const timing = trigger.type & 16 ? 'after update' : 'after insert or delete'
  const when = trigger.type & 16 ? ` when (${rowsDiffer(trigger.columns)})` : ''
  const args = trigger.args.map(quoteLiteral).join(', ')
  return `create trigger ${quoteIdent(trigger.name)} ${timing} on ${table} for each row${when} execute function ${quoteIdent(schema)}."capture"(${args})`
}

/** What one resource's triggers are made from: its table as SQL, the triggers it has, and the names it drops first (`cutNames`). */
export type ResourceCapture = { table: string; triggers: TriggerSpec[]; replaces?: string[] }

/** One resource's triggers, each dropped and made again, so a trigger of an earlier shape is replaced. */
export const resourceCaptureSql = (schema: string, { table, triggers, replaces = [] }: ResourceCapture) =>
  [...replaces.map((name) => `${dropTriggerSql(name, table)};`), ...triggers.flatMap((trigger) => [`${dropTriggerSql(trigger.name, table)};`, `${createTriggerSql(schema, trigger, table)};`])].join('\n')

/** What the triggers of `model` are made from. */
export const resourceCapture = (model: ResourceModel): ResourceCapture => {
  const replaces = cutNames(model.table)
  return { table: tableSql(model), triggers: resourceTriggers(model), ...(replaces.length > 0 && { replaces }) }
}

/** Drops the triggers a resource on `table` had. */
export const dropCaptureSql = (table: { schema?: string; name: string }) => [...cutNames(table), ...triggerNames(table)].map((name) => `${dropTriggerSql(name, qualified(table))};`).join('\n')
