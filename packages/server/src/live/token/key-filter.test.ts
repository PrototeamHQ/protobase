import { describe, expect, it } from 'vitest'
import { f, printFilter, resource } from '@protobase/schema'
import { keyFilter } from './key-filter'

describe('keyFilter', () => {
  it('names the record by each part of its key', () => {
    const tasks = resource('tasks').table('tasks').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
    const lines = resource('lines').table('lines').fields({ order: f.text(), line: f.integer() }).primaryKey((r) => [r.order, r.line]).toModel()
    expect(printFilter(keyFilter(tasks, [3]))).toBe('in(id, 3)')
    expect(printFilter(keyFilter(lines, ['A-1', 2]))).toBe('in(order, "A-1") AND in(line, 2)')
    expect(printFilter(keyFilter(lines, ['A*', 2]))).toBe('in(order, "A*") AND in(line, 2)')
  })
})
