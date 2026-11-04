import type { Problem } from './problem'
import type { Trigger } from './types'

// One cron field: `*`, a number, a range, a list or a step, as five-field cron writes them.
const cronField = /^(\*|\d+(-\d+)?)(\/\d+)?(,(\*|\d+(-\d+)?)(\/\d+)?)*$/

const knownZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return false
  }
}

/** What the schema cannot check of a trigger: a schedule's five cron fields and its IANA time zone. */
export const triggerProblems = (trigger: Trigger): Problem[] => {
  if (!('schedule' in trigger)) return []
  const problems: Problem[] = []
  const fields = trigger.schedule.cron.trim().split(/\s+/)
  if (fields.length !== 5 || !fields.every((field) => cronField.test(field))) problems.push({ field: 'trigger.schedule.cron', message: 'must be a cron of 5 fields, such as 0 6 * * *' })
  const zone = trigger.schedule.timezone
  if (zone !== undefined && !knownZone(zone)) problems.push({ field: 'trigger.schedule.timezone', message: `"${zone}" is not an IANA time zone, such as Europe/Amsterdam` })
  return problems
}
