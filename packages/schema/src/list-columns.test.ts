import { describe, expect, it } from 'vitest'
import { listColumnNames } from './list-columns'
import type { ResourceModel, ViewModel } from './model'

const names = ['sealed', 'a', 'b', 'c', 'd', 'e', 'f', 'g']
const model = { name: 'orders', fields: Object.fromEntries(names.map((name) => [name, { name, type: 'text', ...(name === 'sealed' && { writeOnly: true }) }])) } as unknown as ResourceModel

describe('listColumnNames', () => {
  it("takes the view's list columns", () => {
    expect(listColumnNames(model, { resource: 'orders', fields: {}, list: { columns: ['c', 'a'] } } as ViewModel)).toEqual(['c', 'a'])
  })

  it('takes the first six fields the caller reads when the view has no list', () => {
    expect(listColumnNames(model, undefined)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})
