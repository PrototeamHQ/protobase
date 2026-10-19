import type { ResourceModel } from '@protobase/schema'
import { jobsSchema } from '../jobs/schema'

export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`

const quoteLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`

const qualified = ({ schema, name }: { schema?: string; name: string }) => (schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name))

/** A Postgres array literal of text, every element quoted, so the same columns always give the same text. */
const textArray = (items: string[]) => `{${items.map((item) => `"${item.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`

// Postgres keeps the whole characters within a name's first 63 bytes.
const identifier = (name: string) => {
  const encoder = new TextEncoder()
  let kept = ''
  for (const char of name) {
    if (encoder.encode(kept + char).length > 63) break
    kept += char
  }
  return kept
}

/** The table as SQL names it, qualified when the resource names a schema. */
export const tableSql = (model: ResourceModel) => qualified(model.table)

/** Whether the triggers capture a resource's changes: for its events, its history, its live updates, or several. */
export const isCaptured = (model: ResourceModel) => (model.events ?? []).length > 0 || model.history === true || model.live === true

/**
 * The outbox: one row per changed row, written in the writer's transaction. `transaction` is the writer's transaction
 * id; `database_role` the role that wrote; `dispatch_after` holds back a change that the process which wrote it is
 * delivering itself. The `alter` adds the role to an outbox of an earlier version.
 */
export const outboxSql = (schema: string) => `create table if not exists ${quoteIdent(schema)}."outbox" (
  "id" bigint generated always as identity primary key,
  "transaction" bigint not null,
  "resource" text not null,
  "op" text not null,
  "old" jsonb,
  "new" jsonb,
  "changed" text[],
  "actor" jsonb,
  "database_role" text,
  "dispatch_after" timestamptz not null default now(),
  "created_at" timestamptz not null default now()
);
alter table ${quoteIdent(schema)}."outbox" add column if not exists "database_role" text`

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

/** A trigger as the database should have it: tgtype bits are row (1), insert (4), delete (8) and update (16). */
export type TriggerSpec = { name: string; type: number; args: string[] }

/** The two triggers of a resource whose changes are captured: inserts and deletes, and updates that change the row. */
export const resourceTriggers = (model: ResourceModel): TriggerSpec[] => {
  const fields = Object.values(model.fields)
  const args = [model.name, textArray(fields.filter((field) => !field.sensitive).map((field) => field.column)), textArray(fields.filter((field) => field.sensitive).map((field) => field.column))]
  return [
    { name: identifier(`${model.table.name}_changes`), type: 1 | 4 | 8, args },
    { name: identifier(`${model.table.name}_changes_update`), type: 1 | 16, args },
  ]
}

export const dropTriggerSql = (name: string, table: string) => `drop trigger if exists ${quoteIdent(name)} on ${table}`

export const createTriggerSql = (schema: string, trigger: TriggerSpec, table: string) => {
  const timing = trigger.type & 16 ? 'after update' : 'after insert or delete'
  const when = trigger.type & 16 ? ' when (old.* is distinct from new.*)' : ''
  const args = trigger.args.map(quoteLiteral).join(', ')
  return `create trigger ${quoteIdent(trigger.name)} ${timing} on ${table} for each row${when} execute function ${quoteIdent(schema)}."capture"(${args})`
}
