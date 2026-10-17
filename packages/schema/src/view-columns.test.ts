import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { view } from './view'

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer(), title: f.text(), progress: f.integer() })
  .primaryKey((r) => r.id)

const through = { resource: 'objective_tasks', field: 'objective_id', key: 'task_id' }

describe('related list columns', () => {
  it('names the column among the columns and keeps its options apart', () => {
    const built = view<typeof objectives>('objectives')
      .list((r, _, c) => ({ columns: [r.title, c.related('tasks', { resource: 'tasks', field: 'id', through, status: 'status', sort: 'position' }), r.progress] }))
      .toModel(objectives.toModel())
    expect(built.list).toEqual({
      columns: ['title', 'tasks', 'progress'],
      relatedColumns: [{ name: 'tasks', resource: 'tasks', field: 'id', through, status: 'status', sort: 'position' }],
    })
  })

  it('leaves relatedColumns out of a list without one', () => {
    expect(view<typeof objectives>('objectives').list((r) => ({ columns: [r.title] })).toModel().list).toEqual({ columns: ['title'] })
  })

  it('refuses two columns of one name', () => {
    const twice = () => view<typeof objectives>('objectives').list((r, _, c) => ({ columns: [r.title, c.related('tasks', { resource: 'tasks', field: 'objective_id', status: 'status' }), c.related('tasks', { resource: 'notes', field: 'objective_id', status: 'kind' })] }))
    expect(twice).toThrow('View "objectives": the list has two columns named "tasks"')
  })

  it('refuses a related column named as a field of the resource', () => {
    const clash = view<typeof objectives>('objectives').list((r, _, c) => ({ columns: [r.title, c.related('progress', { resource: 'tasks', field: 'objective_id', status: 'status' })] }))
    expect(() => clash.toModel(objectives.toModel())).toThrow('View "objectives": related column "progress" has the name of a field of the resource')
  })

  it('shows a related column as dots on a card by its name', () => {
    const built = view<typeof objectives>('objectives')
      .list((r, d, c) => {
        const tasks = c.related('tasks', { resource: 'tasks', field: 'id', through, status: 'status', sort: 'position' })
        return { columns: [r.title, tasks], displays: [d.cards({ title: r.title, dots: [tasks] })] }
      })
      .toModel(objectives.toModel())
    expect(built.list?.displays).toEqual([{ kind: 'cards', name: 'cards', title: 'title', dots: ['tasks'] }])
  })

  it('refuses dots of a related column that is not among the columns', () => {
    const stray = () =>
      view<typeof objectives>('objectives').list((r, d, c) => ({ columns: [r.title], displays: [d.cards({ dots: [c.related('tasks', { resource: 'tasks', field: 'objective_id', status: 'status' })] })] }))
    expect(stray).toThrow('View "objectives": display "cards" shows dots of "tasks", which is not a related column of the list')
  })
})
