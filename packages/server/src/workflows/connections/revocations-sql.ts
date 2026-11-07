import { quoteIdent } from '../../changes/capture-sql'

/**
 * The tokens of disconnected accounts that their provider did not revoke, encrypted with the app's secret, each kept
 * only until its job revokes it or gives up (see `connectionRevocations`).
 */
export const revocationsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `create table if not exists ${s}."connection_revocations" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text not null,
  "hint" text not null check ("hint" in ('refresh_token', 'access_token')),
  "token" text not null,
  "created_at" timestamptz not null default now()
)`
}
