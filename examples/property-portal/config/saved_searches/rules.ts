import { readSearchFilter } from './filter'

/** The fields of a saved search its rules read, as a write gives them: the record as it would be stored. */
export type SearchRecord = { filter?: string | null }

/** What is wrong with a saved search, by field: its filter is one the listings can be filtered by. */
export const searchIssues = (record: SearchRecord) => {
  const read = readSearchFilter(record.filter ?? '')
  return read.ok ? undefined : [{ field: 'filter' as const, message: `Not a filter of the listings: ${read.problems.join('; ')}` }]
}
