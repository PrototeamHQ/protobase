import { quoteIdent } from '../changes/capture-sql'

/**
 * The history of the resources with `.history()`: a row per record and transaction, as events see the change. `before`
 * and `after` are the fields by name, without sensitive ones; `changed` names the fields an update changed, sensitive
 * ones included. `actor_id` and `actor_roles` are the API's caller, `null` for a write from elsewhere; `database_role`
 * is the role that wrote, `null` for a change captured before Protobase kept it.
 */
/** An index for each read the record pages and the Activity list take, by name, so a migration can add the ones a table lacks. */
export const historyIndexes = [
  ['history_record', '"resource", "record_key", "id"'],
  ['history_tenant', '"tenant_id", "id"'],
  ['history_at', '"at"'],
  ['history_record_key', '"record_key"'],
  ['history_operation', '"operation"'],
  ['history_actor', '"actor_id"'],
  ['history_database_role', '"database_role"'],
  ['history_transaction', '"transaction"'],
] as const

export const historyTableSql = (schema: string) => {
  const table = `${quoteIdent(schema)}."history"`
  return `create table if not exists ${table} (
  "id" bigint generated always as identity primary key,
  "resource" text not null,
  "record_key" text not null,
  "tenant_id" text,
  "operation" text not null check ("operation" in ('create', 'update', 'delete', 'undelete')),
  "before" jsonb,
  "after" jsonb,
  "changed" jsonb not null,
  "actor_id" text,
  "actor_roles" jsonb,
  "database_role" text,
  "transaction" bigint not null,
  "at" timestamptz not null
);
${historyIndexes.map(([name, columns]) => `create index if not exists "${name}" on ${table} (${columns})`).join(';\n')}`
}
