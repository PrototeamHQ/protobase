/** When a status clears, as the picker offers it: never, after a while, at the end of the day or week, or a time picked. */
export const clearChoices = ['never', 'thirty_minutes', 'one_hour', 'four_hours', 'today', 'this_week', 'custom'] as const
export type ClearChoice = (typeof clearChoices)[number]

const minutes = { thirty_minutes: 30, one_hour: 60, four_hours: 240 } as const

// Midnight in the person's own time zone, `days` after the start of `now`'s day.
const midnightAfter = (now: Date, days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)

/**
 * The time a status set at `now` clears for the choice, as an ISO string: `null` for never; the end of today and of this
 * week (Sunday night) are midnight in the person's own time zone; `custom` takes a `datetime-local` value, also in
 * their time zone, and gives `undefined` while it is empty or no time.
 */
export const clearTimeOf = (choice: ClearChoice, now: Date, custom = ''): string | null | undefined => {
  if (choice === 'never') return null
  if (choice === 'today') return midnightAfter(now, 1).toISOString()
  // Days to the coming Monday, a whole week on a Monday.
  if (choice === 'this_week') return midnightAfter(now, (8 - now.getDay()) % 7 || 7).toISOString()
  if (choice === 'custom') {
    const picked = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(custom) ? new Date(custom) : undefined
    return picked && !Number.isNaN(picked.getTime()) ? picked.toISOString() : undefined
  }
  return new Date(now.getTime() + minutes[choice] * 60_000).toISOString()
}

const pad = (value: number) => String(value).padStart(2, '0')

/** A time as a `datetime-local` input shows it, in the person's own time zone, to the minute. */
export const localInputValue = (iso: string) => {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
