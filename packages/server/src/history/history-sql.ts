import { quoteIdent } from '../changes/capture-sql'

/**
 * The history of the resources with `.history()`: a row per record and transaction, as events see the change. `before`
 * and `after` are the fields by name, without sensitive ones; `changed` names the fields an update changed, sensitive
 * ones included. `actor_id` and `actor_roles` are the API's caller, `null` for a write from elsewhere; `database_role`
 * is the role that wrote, `null` for a change captured before Protobase kept it.
 */
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
create index if not exists "history_record" on ${table} ("resource", "record_key", "id");
create index if not exists "history_tenant" on ${table} ("tenant_id", "id");
create index if not exists "history_at" on ${table} ("at")`
}
