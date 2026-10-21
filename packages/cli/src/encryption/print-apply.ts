import type { ApplyResult } from '@protobase/server'
import { failedAuthenticationHint, unreadableLine } from './print-status'

/** Prints what apply did per field, and tells whether values that do not open remain. */
export const printApply = (result: ApplyResult, out: (text: string) => void) => {
  for (const field of result.fields) {
    const counts = [`${field.encrypted} encrypted`, `${field.reencrypted} re-encrypted`, `${field.rebound} rebound`, `${field.skipped} skipped`, `${field.unreadable.length} unreadable`]
    out(`${field.resource}.${field.field}: ${counts.join(', ')}; old values removed from ${field.historyScrubbed} history rows and ${field.outboxScrubbed} undispatched changes\n`)
    for (const entry of field.unreadable) out(unreadableLine(field.resource, field.field, entry))
  }
  for (const key of result.warnings) out(`warning: ${key.resource}'s key changes with another record's through foreign key ${key.constraint}, which makes its encrypted values unreadable\n`)
  const unreadable = result.fields.some((field) => field.unreadable.length > 0)
  if (result.fields.some((field) => field.unreadable.some((entry) => entry.kind === 'failed-authentication'))) out(failedAuthenticationHint)
  return unreadable
}
