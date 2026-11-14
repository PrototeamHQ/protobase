import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { frameFor, valueScopeOf, type ScopeFrame } from './record-scope'

const model = (name: string, fields: string[]) => ({ name, fields: Object.fromEntries(fields.map((field) => [field, { name: field }])) }) as unknown as ResourceModel

const task: ScopeFrame = { model: model('tasks', ['id', 'title', 'status']), record: { id: 7, title: 'Ship', status: 'open' }, key: '7' }
const claim: ScopeFrame = { model: model('task_claims', ['id', 'status', 'worker']), record: { id: 3, status: 'claimed', worker: 2 }, key: '3', row: { index: 0, count: 2 } }

describe('frameFor', () => {
  it('reads a bare name from the nearest record whose resource has the field, and ../ and this. from one record', () => {
    expect(frameFor([task, claim], 'status')).toEqual({ frame: claim, path: 'status' })
    expect(frameFor([task, claim], 'title')).toEqual({ frame: task, path: 'title' })
    expect(frameFor([task, claim], 'worker.name')).toEqual({ frame: claim, path: 'worker.name' })
    expect(frameFor([task, claim], '../status')).toEqual({ frame: task, path: 'status' })
    expect(frameFor([task, claim], 'this.id')).toEqual({ frame: claim, path: 'id' })
    expect(frameFor([task, claim], '@index')).toBeUndefined()
    expect(frameFor([], 'title')).toBeUndefined()
  })
})

describe('valueScopeOf', () => {
  it('gives the fillers the records and their rows', () => {
    expect(valueScopeOf([task, claim])).toEqual({ stack: [{ record: task.record }, { record: claim.record, row: { index: 0, count: 2 } }] })
  })
})
