import type { NotificationsNames } from './options'

/** A check constraint on the devices table's kind column, by name, with its definition as Postgres writes it. */
export type KindCheck = { name: string; def: string }

type Columns = NotificationsNames['columns']

// The two checks the framework wrote before devices could be relay devices, as Postgres writes them, with the
// table's column names. Postgres quotes a name only where it needs to, so both sides are compared without quotes.
const legacyDefs = (c: Columns) => [
  `CHECK ((${c.kind} = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text])))`,
  `CHECK ((((${c.kind} = 'web'::text) AND (${c.p256dh} IS NOT NULL) AND (${c.auth} IS NOT NULL) AND (${c.environment} IS NULL) AND (${c.app_id} IS NULL))` +
    ` OR ((${c.kind} = 'apns'::text) AND (${c.p256dh} IS NULL) AND (${c.auth} IS NULL) AND (${c.environment} IS NOT NULL) AND (${c.app_id} IS NOT NULL))` +
    ` OR ((${c.kind} = 'fcm'::text) AND (${c.p256dh} IS NULL) AND (${c.auth} IS NULL) AND (${c.environment} IS NULL))))`,
]

const unquoted = (def: string) => def.replaceAll('"', '')

/**
 * The names of the framework's kind checks written before devices could be relay devices: each check whose definition
 * is exactly one the framework wrote then, whatever the other checks allow. Any other check, such as one the app wrote
 * or changed to restrict more, is the app's own and is kept.
 */
export const legacyKindChecks = (checks: readonly KindCheck[], columns: Columns) => {
  const legacy = new Set(legacyDefs(columns))
  return checks.filter((check) => legacy.has(unquoted(check.def))).map((check) => check.name)
}
