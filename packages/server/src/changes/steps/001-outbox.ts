import { quoteIdent } from '../capture-sql'

// Step 1 of the change capture: frozen once released, as every step is.

/**
 * The outbox: one row per changed row, written in the writer's transaction. `transaction` is the writer's transaction
 * id; `database_role` the role that wrote; `dispatch_after` holds back a change that the process which wrote it is
 * delivering itself.
 */
export const outboxStep = (schema: string) => `create schema if not exists ${quoteIdent(schema)};
create table if not exists ${quoteIdent(schema)}."outbox" (
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
);`
