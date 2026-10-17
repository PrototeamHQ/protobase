import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { dotCard, relatedColumnLoads } from './dot-card'

const tasksView = (displays: NonNullable<ViewModel['list']>['displays']) => ({ resource: 'tasks', fields: {}, filters: [], layout: [], actions: [], list: { columns: ['title'], displays } }) as ViewModel

describe('dotCard', () => {
  it("takes the view's first cards display, without photos, a favorite button or dots", () => {
    const view = tasksView([
      { kind: 'custom', name: 'board', label: 'Board', component: 'Board', fields: [] },
      { kind: 'cards', name: 'cards', subtitle: 'owner', badge: 'status', photos: { resource: 'shots', field: 'task_id', image: 'file' }, favorite: { resource: 'stars', field: 'task_id' }, dots: ['subtasks'] },
      { kind: 'cards', name: 'small', title: 'title' },
    ])
    expect(dotCard(view, 'status')).toEqual({ kind: 'cards', name: 'cards', subtitle: 'owner', badge: 'status' })
  })

  it('shows the title and the status without a cards display', () => {
    expect(dotCard(undefined, 'status')).toEqual({ kind: 'cards', name: 'dot', badge: 'status' })
  })
})

describe('relatedColumnLoads', () => {
  const tasks = { name: 'tasks', primaryKey: ['id'], fields: { id: { name: 'id', type: 'integer' }, title: { name: 'title', type: 'text' }, status: { name: 'status', type: 'enum' }, owner: { name: 'owner', type: 'text' } } } as unknown as ResourceModel
  const column = { name: 'tasks', resource: 'tasks', field: 'objective_id', status: 'status' }
  const objectivesView = { resource: 'objectives', fields: {}, filters: [], layout: [], actions: [], list: { columns: ['title', 'tasks'], relatedColumns: [column, { ...column, name: 'gone', resource: 'nothing' }] } } as ViewModel

  it("loads each related column the list shows with the fields of its dots' cards", () => {
    const views = { tasks: tasksView([{ kind: 'cards', name: 'cards', subtitle: 'owner', badge: 'status' }]) }
    expect(relatedColumnLoads(objectivesView, { tasks }, views, ['title', 'tasks', 'gone'])).toEqual([{ column, fields: ['title', 'owner', 'status'] }])
  })

  it('loads none the list leaves out', () => {
    expect(relatedColumnLoads(objectivesView, { tasks }, {}, ['title'])).toEqual([])
  })
})
