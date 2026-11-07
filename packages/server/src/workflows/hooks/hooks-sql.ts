import { quoteIdent } from '../../changes/capture-sql'

/**
 * The webhook URL each workflow has, at most one: the SHA-256 of its key, which only the URL holds, and its secret.
 * A `bearer` secret is kept as its SHA-256 alone; `standard_webhooks` and `hmac` keep the secret itself, which checking
 * a signature needs. No API resource reads it. A workflow's delete removes its row, so its URL stops at once.
 */
export const hooksSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."hooks" (
  "workflow_id" uuid primary key references ${s}."workflows" ("id") on delete cascade,
  "key_hash" text not null unique,
  "secret" text,
  "secret_hash" text not null,
  "tenant_id" text,
  "created_at" timestamptz not null default now()
)`
}
