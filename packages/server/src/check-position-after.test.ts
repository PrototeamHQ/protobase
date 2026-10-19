import { describe, expect, it } from 'vitest'
import { f, resource, type PositionAfterModel } from '@protobase/schema'
import { checkPositionAfter } from './check-position-after'
import { buildRegistry } from './registry'

const tasks = (after: PositionAfterModel) =>
  resource('tasks').table('tasks').fields({ id: f.integer(), status: f.text().filterable(), position: f.integer().sortable() }).primaryKey((r) => r.id).position((r) => r.position, { after })
const links = resource('links').table('links')
  .fields({ task_id: f.relation('tasks').filterable(), type: f.text().filterable(), depends_on_id: f.relation('tasks').filterable(), note: f.relation('tasks') })
  .primaryKey((r) => [r.task_id, r.depends_on_id])
const after = { resource: 'links', field: 'task_id', key: 'depends_on_id', filter: 'type = "blocked-by"', while: 'status != "done"' }

describe('checkPositionAfter', () => {
  it('takes filterable relations to the ranked resource with filters that fit', () => {
    expect(() => checkPositionAfter(buildRegistry([tasks(after), links]))).not.toThrow()
  })

  it('names what does not fit', () => {
    expect(() => checkPositionAfter(buildRegistry([tasks({ ...after, resource: 'gone' }), links]))).toThrow('tasks position after: unknown resource "gone"')
    expect(() => checkPositionAfter(buildRegistry([tasks({ ...after, key: 'note' }), links]))).toThrow('"note" on links is not filterable')
    expect(() => checkPositionAfter(buildRegistry([tasks({ ...after, while: 'missing = 1' }), links]))).toThrow('tasks position after: while:')
  })
})
