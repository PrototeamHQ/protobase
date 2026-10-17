import { describe, expect, it } from 'vitest'
import { f, resource, restrictModel, view, type RelatedColumnModel, type ResourceModel } from '@protobase/schema'
import { checkViews } from './check-views'
import type { Registry } from './registry'
import { pruneView } from './view-access'
import { relatedColumnErrors } from './view-related-column'

const objectives = resource('objectives').table('objectives').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().filterable(), title: f.text(), status: f.enum(['todo', 'done']), position: f.integer().sortable(), owner: f.text().sensitive(), kind: f.enum(['bug', 'chore']).sensitive() })
  .primaryKey((r) => r.id)
const objectiveTasks = resource('objective_tasks')
  .table('objective_tasks')
  .fields({ id: f.integer(), objectiveId: f.relation('objectives').filterable(), taskId: f.relation('tasks') })
  .primaryKey((r) => r.id)

const all: Record<string, ResourceModel> = { objectives: objectives.toModel(), tasks: tasks.toModel(), objective_tasks: objectiveTasks.toModel() }

const column: RelatedColumnModel = { name: 'tasks', resource: 'tasks', field: 'id', through: { resource: 'objective_tasks', field: 'objectiveId', key: 'taskId' }, status: 'status', sort: 'position' }

const objectivesView = view<typeof objectives>('objectives')
  .list((r, _, c) => ({ columns: [r.title, c.related('tasks', { ...column, label: 'Tasks' })] }))
  .toModel()

// The models as a caller who cannot read `hidden` and cannot see the `gone` resources gets them, as `/meta` does.
const without = (hidden: Record<string, string[]>, gone: string[] = []): Record<string, ResourceModel> =>
  Object.fromEntries(
    Object.entries(all)
      .filter(([name]) => !gone.includes(name))
      .map(([name, model]) => {
        const readableFields = Object.keys(model.fields).filter((field) => !hidden[name]?.includes(field))
        return [name, restrictModel(model, { readableFields, writableFields: { create: readableFields, update: readableFields } })]
      }),
  )

describe('relatedColumnErrors', () => {
  it('takes records through a join resource, coloured by an enum', () => {
    expect(relatedColumnErrors(column, 'objectives', all)).toEqual([])
  })

  it('wants the status to be an enum field of the shown resource that is not sensitive', () => {
    expect(relatedColumnErrors({ ...column, status: 'nope' }, 'objectives', all)).toEqual(['status: unknown field "nope" on tasks'])
    expect(relatedColumnErrors({ ...column, status: 'title' }, 'objectives', all)).toEqual(['status: "title" on tasks is not an enum field'])
    expect(relatedColumnErrors({ ...column, status: 'kind' }, 'objectives', all)).toEqual(['status: "kind" on tasks is sensitive, so it cannot be shown'])
  })

  it('matches the records as a related section does', () => {
    expect(relatedColumnErrors({ ...column, through: { ...column.through!, field: 'taskId' } }, 'objectives', all)).toEqual([
      'through: "taskId" on objective_tasks is not filterable',
    ])
    expect(relatedColumnErrors({ ...column, sort: 'title' }, 'objectives', all)).toHaveLength(1)
    expect(relatedColumnErrors({ ...column, resource: 'notes' }, 'objectives', all)).toEqual(['unknown resource "notes"'])
  })
})

describe('checkViews with related columns', () => {
  const registry = { entries: Object.entries(all).map(([name, model]) => ({ name, model })) } as unknown as Registry

  it('takes a related column that fits the resources', () => {
    expect(() => checkViews(registry, [objectivesView])).not.toThrow()
  })

  it('refuses one that does not fit, or is not among the columns', () => {
    const stale = structuredClone(objectivesView)
    stale.list!.relatedColumns = [{ ...column, status: 'title' }]
    expect(() => checkViews(registry, [stale])).toThrow('View "objectives": related column "tasks": status: "title" on tasks is not an enum field')
    stale.list!.columns = ['title']
    expect(() => checkViews(registry, [stale])).toThrow('View "objectives": related column "tasks": it is not among the list\'s columns')
  })
})

describe('pruneView with related columns', () => {
  const listFor = (models: Record<string, ResourceModel>) => pruneView(objectivesView, models.objectives!, models).list

  it('keeps the column for a caller who can read what it shows', () => {
    expect(listFor(all)).toEqual(objectivesView.list)
  })

  it('leaves the column out of the columns when the caller cannot read its status or a resource it reads', () => {
    expect(listFor(without({ tasks: ['status'] }))).toEqual({ columns: ['title'] })
    expect(listFor(without({}, ['objective_tasks']))).toEqual({ columns: ['title'] })
  })

  it('still leaves out a field column the caller cannot read', () => {
    expect(listFor(without({ objectives: ['title'] }))).toEqual({ columns: ['tasks'], relatedColumns: objectivesView.list!.relatedColumns })
  })
})
