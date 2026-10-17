/** How long record history is kept (`history` in `protobase.config.ts`). */
export type HistoryOptions = {
  /** Days a change is kept; a daily job deletes older ones. Kept forever when omitted. */
  days?: number
}

/** The days of the options, checked: a positive whole number, or none. */
export const historyDays = (options: HistoryOptions = {}) => {
  const { days } = options
  if (days !== undefined && (!Number.isInteger(days) || days < 1)) throw new Error(`history.days must be a positive whole number of days, not ${days}`)
  return days
}
