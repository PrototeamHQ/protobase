/** A check constraint on the devices table's kind column, by name, with its definition as Postgres writes it. */
export type KindCheck = { name: string; def: string }

// A check the framework wrote lists every kind it knew: one without all of them is the app's own.
const isFrameworkCheck = (check: KindCheck) => ["'web'", "'apns'", "'fcm'"].every((kind) => check.def.includes(kind))

/**
 * The names of the framework's kind checks written before devices could be relay devices: each one that lists the
 * kinds but not relay, whatever the other checks allow. The app's own checks and those that allow relay are kept.
 */
export const legacyKindChecks = (checks: readonly KindCheck[]) =>
  checks.filter((check) => isFrameworkCheck(check) && !check.def.includes("'relay'")).map((check) => check.name)
