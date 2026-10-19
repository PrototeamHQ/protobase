import { describe, expect, it } from 'vitest'
import type { RelatedModel } from '@protobase/schema'
import { relatedValue } from './related-value'

const item = (from?: string): RelatedModel => ({ kind: 'related', title: 'Links', resource: 'task_links', field: 'task_id', from })

describe('relatedValue', () => {
  it('is the record key without from', () => {
    expect(relatedValue(item(), { task_id: 4 }, '9')).toBe('9')
  })

  it('reads a raw value, a number staying a number and a boolean a boolean', () => {
    expect(relatedValue(item('task_id'), { task_id: 'a' }, '9')).toBe('a')
    expect(relatedValue(item('task_id'), { task_id: 4 }, '9')).toBe(4)
    expect(relatedValue(item('task_id'), { task_id: false }, '9')).toBe(false)
  })

  it('reads the key of a list row relation', () => {
    expect(relatedValue(item('task_id'), { task_id: { id: 4, name: 'Task' } }, '9')).toBe(4)
  })

  it('is null when the record holds none', () => {
    expect(relatedValue(item('task_id'), { task_id: null }, '9')).toBeNull()
    expect(relatedValue(item('task_id'), {}, '9')).toBeNull()
  })
})
