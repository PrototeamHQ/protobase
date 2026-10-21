import type { EncryptionStatus, UnreadableEntry } from '@protobase/server'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** One line per value that does not open: never the value. */
export const unreadableLine = (resource: string, field: string, entry: UnreadableEntry) =>
  `  ${resource}.${field} ${JSON.stringify(entry.key)}: ${entry.kind}${entry.kid ? ` [key ${entry.kid}]` : ''}\n`

/** What causes values that fail authentication, printed once when there are any. */
export const failedAuthenticationHint =
  'Values fail authentication when their table or column was renamed or moved (protobase encryption apply --rebind), the resource\'s key or tenant field changed, their record\'s key changed in the database, or they were copied there by SQL.\n'

/**
 * Prints the status and tells whether anything needs work: plaintext, values under a previous key, values that do not
 * open, old values in history or the outbox, or envelopes in fields that are not encrypted.
 */
export const printStatus = (status: EncryptionStatus, out: (text: string) => void) => {
  let dirty = false
  out(`Current key ${status.kid}\n`)
  for (const field of status.fields) {
    const keys = Object.entries(field.byKey).map(([kid, count]) => `${count} under ${kid === status.kid ? `key ${kid} (current)` : `key ${kid}`}`)
    const parts = [...keys, `${field.plaintext} plaintext`, `${field.unreadable.length} unreadable`]
    out(`${field.resource}.${field.field}: ${parts.join(', ')}\n`)
    for (const entry of field.unreadable) out(unreadableLine(field.resource, field.field, entry))
    if (field.history > 0 || field.outbox > 0) out(`  old values left in ${plural(field.history, 'history row')} and ${plural(field.outbox, 'undispatched change')}\n`)
    dirty ||= field.plaintext > 0 || field.unreadable.length > 0 || keys.length > (field.byKey[status.kid] ? 1 : 0) || field.history > 0 || field.outbox > 0
  }
  for (const stray of status.stray) out(`${stray.resource}.${stray.field} is not encrypted but holds ${plural(stray.count, 'encrypted value')}\n`)
  for (const key of status.cascading) out(`warning: ${key.resource}'s key changes with another record's through foreign key ${key.constraint}, which makes its encrypted values unreadable\n`)
  if (status.fields.some((field) => field.unreadable.some((entry) => entry.kind === 'failed-authentication'))) out(failedAuthenticationHint)
  return dirty || status.stray.length > 0
}
