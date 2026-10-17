import { describe, expect, it } from 'vitest'
import { dotsSummary } from './dots-summary'

const options = { values: ['todo', 'doing', 'done'], label: (value: string) => ({ todo: 'To do', doing: 'Doing', done: 'Done' })[value] ?? value, singular: 'task', plural: 'tasks' }

describe('dotsSummary', () => {
  it('counts the records and each status, in the order of the values', () => {
    expect(dotsSummary(['done', 'todo', 'done', 'done'], options)).toBe('4 tasks: 1 To do, 3 Done')
  })

  it('says one record in the singular', () => {
    expect(dotsSummary(['doing'], options)).toBe('1 task: 1 Doing')
  })

  it('says there are none', () => {
    expect(dotsSummary([], options)).toBe('No tasks')
  })

  it('counts a value the field no longer has after the others, and leaves out records without a status', () => {
    expect(dotsSummary(['done', 'archived', null], options)).toBe('3 tasks: 1 Done, 1 archived')
  })
})
