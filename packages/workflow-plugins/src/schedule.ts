import type { PollingTrigger } from '@protobase/workflows/plugin'

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

/** What the schema cannot check of a schedule: its five cron fields and its IANA time zone. */
const scheduleProblems = (input: Record<string, unknown>) => {
  const problems: { field: string; message: string }[] = []
  const fields = String(input.cron).trim().split(/\s+/)
  if (fields.length !== 5 || !fields.every((field) => cronField.test(field))) problems.push({ field: 'cron', message: 'must be a cron of 5 fields, such as 0 6 * * *' })
  const zone = input.timezone
  if (typeof zone === 'string' && !knownZone(zone)) problems.push({ field: 'timezone', message: `"${zone}" is not an IANA time zone, such as Europe/Amsterdam` })
  return problems
}

/** `app:schedule`: one run at each time of a cron, in a time zone, with the time as the run's input. */
export const scheduleTriggers: Record<string, PollingTrigger> = {
  schedule: {
    kind: 'polling',
    label: 'Schedule',
    description: 'Starts one run at each time of a cron schedule, such as 0 6 * * 1-5 in Europe/Amsterdam.',
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['cron'],
      properties: {
        cron: { type: 'string', minLength: 1, description: 'five cron fields: minute, hour, day of month, month, day of week' },
        timezone: { type: 'string', minLength: 1, description: 'an IANA time zone, such as Europe/Amsterdam; default UTC' },
      },
    },
    output: { type: 'object', description: '{ scheduled_at }: the time this run was scheduled for' },
    check: scheduleProblems,
    every: (input) => ({ cron: input.cron as string, ...(typeof input.timezone === 'string' && { timezone: input.timezone }) }),
    limit: 1,
    start: async () => null,
    // Each poll is one time of the schedule: the time is the key, so a time starts one run however often it is polled.
    poll: async ({ due }) => ({ items: [{ key: `schedule:${due.toISOString()}`, data: { scheduled_at: due.toISOString() } }], cursor: due.toISOString() }),
  },
}
