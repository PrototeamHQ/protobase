import { describe, expect, it } from 'vitest'
import { columnsAllowed } from './board-allowed'

const columns = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: null, label: 'No status' },
]
const values = (filter: string) => columnsAllowed(filter, 'status', columns).map((column) => column.value)

describe('columnsAllowed', () => {
  it('keeps every column for an empty or unparsable filter', () => {
    expect(values('')).toHaveLength(4)
    expect(values('status = ')).toHaveLength(4)
  })
  it('keeps the columns an = clause allows, and not the empty one', () => {
    expect(values('status = "doing"')).toEqual(['doing'])
  })
  it('keeps the columns an in clause allows', () => {
    expect(values('in(status, "todo", "doing")')).toEqual(['todo', 'doing'])
  })
  it('keeps what every clause on the field allows', () => {
    expect(values('in(status, "todo", "doing") AND status = "doing"')).toEqual(['doing'])
  })
  it('ignores clauses on other fields', () => {
    expect(values('assignee = "me" AND status = "done"')).toEqual(['done'])
    expect(values('assignee = "me"')).toHaveLength(4)
  })
  it('keeps every column for an OR or a negation', () => {
    expect(values('status = "done" OR assignee = "me"')).toHaveLength(4)
    expect(values('status != "done"')).toHaveLength(4)
  })
})
