import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { embeddedReadFields } from './embedded-read-fields'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), title: f.text(), state: f.text(), brief: f.text(), owner_id: f.relation('people'), project_id: f.relation('projects') })
  .primaryKey((r) => r.id)
const model = tasks.toModel()
const titled = view<typeof tasks>('tasks').title((r) => r.title).toModel()

describe('embeddedReadFields', () => {
  it('reads the shown fields, the key and the title, not the rest of the record', () => {
    expect(embeddedReadFields(model, titled, { shown: ['state'], bulk: false })).toEqual(['id', 'state', 'title'])
  })

  it('reads a path through relations by the relation it starts at', () => {
    expect(embeddedReadFields(model, titled, { shown: ['owner_id.team_id', 'state'], bulk: false })).toEqual(['id', 'owner_id', 'state', 'title'])
  })

  it('reads the relation a row opens', () => {
    expect(embeddedReadFields(model, titled, { shown: ['state'], opens: 'project_id', bulk: false })).toEqual(['id', 'state', 'project_id', 'title'])
  })

  it('reads the fields a derived title reads', () => {
    const derived = view<typeof tasks>('tasks').title((r) => r.title).titleFrom('task', (r) => [r.state, r.owner_id]).toModel()
    expect(embeddedReadFields(model, derived, { shown: [], bulk: false })).toEqual(['id', 'title', 'state', 'owner_id'])
  })

  it('leaves out fields the reader may not see', () => {
    const { brief: _brief, ...visible } = model.fields
    expect(embeddedReadFields({ ...model, fields: visible }, titled, { shown: ['state', 'brief'], bulk: false })).toEqual(['id', 'state', 'title'])
  })

  it('reads whole records when its actions run on selected rows, since a handler may read any field', () => {
    expect(embeddedReadFields(model, titled, { shown: ['state'], bulk: true })).toBeUndefined()
  })
})
