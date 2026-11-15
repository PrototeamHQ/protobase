import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { rowButtonFor } from './row-button-for'

const holds = resource('holds')
  .table('holds')
  .fields({ id: f.integer(), task_id: f.relation('tasks').filterable(), verb: f.text(), tab: f.text(), report_url: f.text(), state: f.enum(['needs_review', 'waiting']).filterable() })
  .primaryKey((r) => r.id)
const model = holds.toModel()
const holdsView = view<typeof holds>('holds')
  .fields((r) => ({ state: r.state.valueLabels({ needs_review: 'Review' }) }))
  .toModel()

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), status: f.enum(['parked', 'done']).filterable(), repo: f.text().filterable(), notes: f.text() })
  .primaryKey((r) => r.id)
const models = { holds: model, tasks: tasks.toModel() }

const review = { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}', tab: 'Review' } }

describe('rowButtonFor', () => {
  it("opens the address the row's fields name", () => {
    expect(rowButtonFor(review, model, holdsView, { id: 1, task_id: 7, verb: 'Approve' }, models)).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Review' } })
  })

  it('opens the tab a field of the row names', () => {
    const tab = { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } }
    expect(rowButtonFor(tab, model, holdsView, { id: 1, task_id: 7, tab: 'Decisions' }, models)).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Decisions' } })
    expect(rowButtonFor(tab, model, holdsView, { id: 1, task_id: 7, tab: null }, models)).toBeUndefined()
  })

  it("opens a list with a filter built from the row's fields", () => {
    const same = { label: 'Same state', to: { kind: 'list' as const, resource: 'holds', filter: 'state = "{{state}}" AND task_id = {{task_id}}' } }
    expect(rowButtonFor(same, model, holdsView, { id: 1, task_id: 7, state: 'waiting' }, models)).toEqual({ label: 'Same state', to: { kind: 'list', resource: 'holds', filter: 'state = "waiting" AND task_id = 7' } })
  })

  it('opens the https page a field of the row holds, and none for any other value', () => {
    const report = { label: 'Report', href: '{{report_url}}' }
    expect(rowButtonFor(report, model, holdsView, { id: 1, report_url: 'https://errors.example/e/42' }, models)).toEqual({ label: 'Report', href: 'https://errors.example/e/42' })
    for (const value of ['http://errors.example/e/42', 'javascript:alert(1)', '/tasks/7', 'errors.example', null]) {
      expect(rowButtonFor(report, model, holdsView, { id: 1, report_url: value }, models)).toBeUndefined()
    }
  })

  it('takes the href path for any href the choice has, as the check does, and `to` only without one', () => {
    const to = { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}' }
    expect(rowButtonFor({ label: 'Open', href: '', to } as never, model, holdsView, { id: 1, task_id: 7 }, models)).toBeUndefined()
    expect(rowButtonFor({ label: 'Open', href: undefined, to } as never, model, holdsView, { id: 1, task_id: 7 }, models)).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7' } })
  })

  it('drops a value outside quotes in a filter that is not a number or a boolean', () => {
    const same = { label: 'Same', to: { kind: 'list' as const, resource: 'holds', filter: 'task_id = {{verb}}' } }
    expect(rowButtonFor(same, model, holdsView, { id: 1, verb: '7' }, models)?.label).toBe('Same')
    expect(rowButtonFor(same, model, holdsView, { id: 1, verb: '7 OR true' }, models)).toBeUndefined()
  })

  it('shows each row the first choice whose fields it holds', () => {
    const lever = [
      { label: 'Error report', href: '{{report_url}}' },
      { label: '{{verb}}', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } },
      { label: 'Same state', to: { kind: 'list' as const, resource: 'holds', filter: 'state = "{{state}}"' } },
    ]
    expect(rowButtonFor(lever, model, holdsView, { id: 1, report_url: 'https://errors.example/e/1', task_id: 7, tab: 'Chat' }, models)).toEqual({ label: 'Error report', href: 'https://errors.example/e/1' })
    expect(rowButtonFor(lever, model, holdsView, { id: 2, task_id: 7, tab: 'Chat', verb: 'Read' }, models)).toEqual({ label: 'Read', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Chat' } })
    expect(rowButtonFor(lever, model, holdsView, { id: 3, state: 'waiting' }, models)).toEqual({ label: 'Same state', to: { kind: 'list', resource: 'holds', filter: 'state = "waiting"' } })
    expect(rowButtonFor(lever, model, holdsView, { id: 4 }, models)).toBeUndefined()
  })

  it('shows no button when the chosen href holds no https URL, rather than the next choice', () => {
    const lever = [{ label: 'Error report', href: '{{report_url}}' }, { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}' } }]
    expect(rowButtonFor(lever, model, holdsView, { id: 1, report_url: 'ftp://errors.example', task_id: 7 }, models)).toBeUndefined()
  })

  it('shows no button on a row without a value for a field it names', () => {
    expect(rowButtonFor(review, model, holdsView, { id: 1, task_id: null }, models)).toBeUndefined()
    expect(rowButtonFor({ ...review, label: '{{verb}}' }, model, holdsView, { id: 1, task_id: 7, verb: '' }, models)).toBeUndefined()
  })

  it("takes the label from the row's fields, an enum value by its label", () => {
    expect(rowButtonFor({ ...review, label: '{{verb}}' }, model, holdsView, { id: 1, task_id: 7, verb: 'Approve' }, models)?.label).toBe('Approve')
    expect(rowButtonFor({ ...review, label: '{{state}}' }, model, holdsView, { id: 1, task_id: 7, state: 'needs_review' }, models)?.label).toBe('Review')
  })

  it('opens the list whose resource and whole filter the row holds', () => {
    const lever = { label: 'Look', to: { kind: 'list' as const, resource: '{{lever_resource}}', filter: '{{lever_filter}}' } }
    const filter = 'status = "parked" AND repo = "x"'
    expect(rowButtonFor(lever, model, holdsView, { id: 1, lever_resource: 'tasks', lever_filter: filter }, models)).toEqual({ label: 'Look', to: { kind: 'list', resource: 'tasks', filter } })
    expect(rowButtonFor(lever, model, holdsView, { id: 1, lever_resource: 'tasks', lever_filter: null }, models)).toBeUndefined()
  })

  it('shows no button for a filter the row holds that does not parse, or names a field the list cannot filter', () => {
    const lever = { label: 'Look', to: { kind: 'list' as const, resource: '{{lever_resource}}', filter: '{{lever_filter}}' } }
    for (const filter of ['status = ', 'status = "parked" AND', 'colour = "red"', 'notes = "x"', 'status = "lost"']) {
      expect(rowButtonFor(lever, model, holdsView, { id: 1, lever_resource: 'tasks', lever_filter: filter }, models)).toBeUndefined()
    }
    expect(rowButtonFor(lever, model, holdsView, { id: 1, lever_resource: 'secrets', lever_filter: 'id = 1' }, models)).toBeUndefined()
  })

  it("checks a filter the row holds against the caller's resources, which leave out what they cannot filter", () => {
    const lever = { label: 'Look', to: { kind: 'list' as const, resource: '{{lever_resource}}', filter: '{{lever_filter}}' } }
    const record = { id: 1, lever_resource: 'tasks', lever_filter: 'repo = "x"' }
    expect(rowButtonFor(lever, model, holdsView, record, models)?.label).toBe('Look')
    const { repo: _, ...fields } = models.tasks.fields
    expect(rowButtonFor(lever, model, holdsView, record, { ...models, tasks: { ...models.tasks, fields } })).toBeUndefined()
  })

  it('takes a whole filter from the row beside a fixed resource', () => {
    const lever = { label: 'Look', to: { kind: 'list' as const, resource: 'tasks', filter: '{{lever_filter}}' } }
    expect(rowButtonFor(lever, model, holdsView, { id: 1, lever_filter: 'repo = "x"' }, models)).toEqual({ label: 'Look', to: { kind: 'list', resource: 'tasks', filter: 'repo = "x"' } })
    expect(rowButtonFor(lever, model, holdsView, { id: 1, lever_filter: 'notes = "x"' }, models)).toBeUndefined()
  })

  it('escapes a quoted value of the row holding quotes, and shows the button', () => {
    const same = { label: 'Same', to: { kind: 'list' as const, resource: 'holds', filter: 'verb = "{{verb}}"' } }
    expect(rowButtonFor(same, model, holdsView, { id: 1, verb: 'say "hi" \\ go' }, models)).toEqual({ label: 'Same', to: { kind: 'list', resource: 'holds', filter: 'verb = "say \\"hi\\" \\\\ go"' } })
  })
})
