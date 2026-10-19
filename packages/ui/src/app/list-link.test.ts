import { describe, expect, it } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { filteredListAddress } from './list-link'

const opening = { list: { columns: ['title'], filter: 'status = "todo"' } } as unknown as ViewModel
const plain = { list: { columns: ['title'] } } as unknown as ViewModel

describe('filteredListAddress', () => {
  it('carries a filter as it is', () => {
    expect(filteredListAddress(opening, 'tasks', 'status = "done"')).toEqual({ kind: 'list', resource: 'tasks', filter: 'status = "done"' })
  })
  it('writes an empty filter when it has none and the list opens on a default', () => {
    expect(filteredListAddress(opening, 'tasks', undefined)).toEqual({ kind: 'list', resource: 'tasks', filter: '' })
  })
  it('stays clean when the list has no default', () => {
    expect(filteredListAddress(plain, 'tasks', '')).toEqual({ kind: 'list', resource: 'tasks' })
    expect(filteredListAddress(undefined, 'tasks', undefined)).toEqual({ kind: 'list', resource: 'tasks' })
  })
})
