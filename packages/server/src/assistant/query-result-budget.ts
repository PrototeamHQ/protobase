import type { QueryResult } from './run-query'
import { budgetedJson, forcedJson, leadingFit } from './result-budget'

const cutCellNote = 'The values in cut_fields were cut to fit the size limit, each with its full length (rows[r][c] is row r, column c); read the rest of one with substring(<column> from <start>), counting characters from 1.'

const fewerRowsNote = (count: number, more: string) => `Only the first ${count} rows fit the size limit${more}. ${cutCellNote}`

/**
 * A query's result as JSON within the size budget: its strings trimmed, then, when that does not fit, only as many
 * leading rows as fit, marked truncated. `more` ends the note on the rows left out, such as how to read on.
 */
export const budgetedQueryResult = (result: QueryResult, more: (count: number) => string) => {
  const json = budgetedJson(result, cutCellNote)
  if (json) return json
  if (result.rows.length <= 1) return forcedJson(result, cutCellNote)
  const leading = (count: number) => {
    const note = fewerRowsNote(count, more(count))
    return { result: { ...result, rows: result.rows.slice(0, count), truncated: true, note }, note }
  }
  const count = leadingFit(result.rows.length - 1, (count) => {
    const { result, note } = leading(count)
    return budgetedJson(result, note) !== undefined
  })
  const { result: fewer, note } = leading(count)
  return forcedJson(fewer, note)
}
