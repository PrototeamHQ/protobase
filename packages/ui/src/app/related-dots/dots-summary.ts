import { text } from './messages'
type SummaryOptions = {
  /** The status field's values, in the order the summary counts them. */
  values: readonly string[]
  /** How a value reads, as the record's badge shows it. */
  label: (value: string) => string
  /** What one record and several are called, such as "task" and "tasks". */
  singular: string
  plural: string
}

/**
 * What a related column's dots say, as text: how many records there are, then how many have each status, in the order
 * of the status's values, such as "4 tasks: 1 To do, 3 Done". "No tasks" without any.
 */
export const dotsSummary = (statuses: readonly unknown[], { values, label, singular, plural }: SummaryOptions) => {
  if (statuses.length === 0) return text('none', plural)
  const counts = new Map<string, number>()
  for (const status of statuses) if (status !== null && status !== undefined) counts.set(String(status), (counts.get(String(status)) ?? 0) + 1)
  const order = [...values, ...[...counts.keys()].filter((value) => !values.includes(value))]
  const parts = order.filter((value) => counts.has(value)).map((value) => `${counts.get(value)} ${label(value)}`)
  const total = `${statuses.length} ${statuses.length === 1 ? singular : plural}`
  return parts.length === 0 ? total : `${total}: ${parts.join(', ')}`
}
