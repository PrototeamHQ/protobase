import type { EventActor } from '@protobase/schema'
import type { Caller } from './resolve-caller'

/**
 * The transaction settings a request admitted by key (`/api/sb/rest/v1`, `/api/sb/storage/v1`) runs with, as Supabase's PostgREST
 * sets them: `role`, which is `SET LOCAL ROLE`, to `anon` or `authenticated`, and the caller's claims in `request.jwt.claims` and its user in
 * `request.jwt.claim.sub`, which `auth.uid()`, `auth.role()` and `auth.jwt()` read. The `role` claim names the
 * database role, as on Supabase, whatever the token's own says. The app's role, of the secret key, sets no role: the
 * connection's own owns the tables. A signed-in user is the actor change capture records, when `actorSetting` is set.
 */
export const callerSettings = (caller: Caller, actorSetting?: string): Record<string, string> => {
  const role = caller.role === 'app' ? 'service_role' : caller.role
  const sub = caller.role === 'authenticated' ? caller.claims.sub : undefined
  const actor: EventActor | undefined = sub === undefined ? undefined : { id: sub, roles: [] }
  return {
    ...(caller.role !== 'app' && { role: caller.role }),
    'request.jwt.claims': JSON.stringify({ ...caller.claims, role }),
    ...(sub !== undefined && { 'request.jwt.claim.sub': sub }),
    ...(actor && actorSetting && { [actorSetting]: JSON.stringify(actor) }),
  }
}
