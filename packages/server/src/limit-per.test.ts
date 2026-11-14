import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { limitPerOf } from './limit-per'

const comments = resource('comments').table('comments')
  .fields({ id: f.integer(), task_id: f.integer().filterable(), body: f.text(), meta: f.json().filterable() })
  .primaryKey((r) => r.id).toModel()

const refusal = (text: string) => {
  try {
    limitPerOf(comments, text)
  } catch (error) {
    return (error as { detail?: string }).detail
  }
  throw new Error(`limit_per=${text} was accepted`)
}

describe('limitPerOf', () => {
  it('reads a field and how many rows to keep per value of it', () => {
    expect(limitPerOf(comments, 'task_id:3')).toEqual({ field: 'task_id', limit: 3 })
    expect(limitPerOf(comments, 'task_id:500')).toEqual({ field: 'task_id', limit: 500 })
    expect(limitPerOf(comments)).toBeUndefined()
  })

  it('refuses an n of 0, below 0, past the largest page or not whole', () => {
    expect(refusal('task_id:0')).toBe('Invalid parameter limit_per: n must be a whole number from 1 to 500')
    expect(refusal('task_id:501')).toBe('Invalid parameter limit_per: n must be a whole number from 1 to 500')
    expect(refusal('task_id:-1')).toBe('Invalid parameter limit_per: Give <field>:<n>, such as task_id:3')
    expect(refusal('task_id:1.5')).toBe('Invalid parameter limit_per: Give <field>:<n>, such as task_id:3')
    expect(refusal('task_id')).toBe('Invalid parameter limit_per: Give <field>:<n>, such as task_id:3')
  })

  it('refuses an unknown, unfilterable or json field', () => {
    expect(refusal('taskid:3')).toBe('Invalid parameter limit_per: Unknown field "taskid"')
    expect(refusal('body:3')).toBe('Invalid parameter limit_per: Field "body" is not filterable')
    expect(refusal('meta:3')).toBe('Invalid parameter limit_per: Field "meta" is json, which has no values to keep rows per')
  })
})
