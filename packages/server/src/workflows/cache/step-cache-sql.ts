import { quoteIdent } from '../../changes/capture-sql'

/**
 * The results step types that cache keep for later calls: one per type, key and the identity the run's rows gave it
 * (`who`: the tenant, and the saver, enabler or bound account where the type acts as them), kept until `expires_at`,
 * with a fingerprint of each secret its key named. `step_cache_shapes` holds which input values a type's calls read, at
 * most 16 per type. Read and written only for steps whose cache is on.
 */
export const stepCacheSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."step_cache" (
  "type" text not null,
  "key" text not null,
  "who" jsonb not null,
  "tenant_id" text,
  "output" jsonb,
  "secrets" jsonb not null,
  "cached_at" timestamptz not null default now(),
  "expires_at" timestamptz not null,
  primary key ("type", "key", "who")
);
create index if not exists "step_cache_expires" on ${s}."step_cache" ("type", "tenant_id", "expires_at");
create table if not exists ${s}."step_cache_shapes" (
  "type" text not null,
  "shape" jsonb not null,
  primary key ("type", "shape")
)`
}
