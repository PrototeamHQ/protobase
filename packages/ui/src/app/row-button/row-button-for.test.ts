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

const review = { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}', tab: 'Review' } }

describe('rowButtonFor', () => {
  it("opens the address the row's fields name", () => {
    expect(rowButtonFor(review, model, holdsView, { id: 1, task_id: 7, verb: 'Approve' })).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Review' } })
  })

  it('opens the tab a field of the row names', () => {
    const tab = { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } }
    expect(rowButtonFor(tab, model, holdsView, { id: 1, task_id: 7, tab: 'Decisions' })).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Decisions' } })
    expect(rowButtonFor(tab, model, holdsView, { id: 1, task_id: 7, tab: null })).toBeUndefined()
  })

  it("opens a list with a filter built from the row's fields", () => {
    const same = { label: 'Same state', to: { kind: 'list' as const, resource: 'holds', filter: 'state = "{{state}}" AND task_id = {{task_id}}' } }
    expect(rowButtonFor(same, model, holdsView, { id: 1, task_id: 7, state: 'waiting' })).toEqual({ label: 'Same state', to: { kind: 'list', resource: 'holds', filter: 'state = "waiting" AND task_id = 7' } })
  })

  it('opens the https page a field of the row holds, and none for any other value', () => {
    const report = { label: 'Report', href: '{{report_url}}' }
    expect(rowButtonFor(report, model, holdsView, { id: 1, report_url: 'https://errors.example/e/42' })).toEqual({ label: 'Report', href: 'https://errors.example/e/42' })
    for (const value of ['http://errors.example/e/42', 'javascript:alert(1)', '/tasks/7', 'errors.example', null]) {
      expect(rowButtonFor(report, model, holdsView, { id: 1, report_url: value })).toBeUndefined()
    }
  })

  it('takes the href path for any href the choice has, as the check does, and `to` only without one', () => {
    const to = { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}' }
    expect(rowButtonFor({ label: 'Open', href: '', to } as never, model, holdsView, { id: 1, task_id: 7 })).toBeUndefined()
    expect(rowButtonFor({ label: 'Open', href: undefined, to } as never, model, holdsView, { id: 1, task_id: 7 })).toEqual({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '7' } })
  })

  it('drops a value outside quotes in a filter that is not a number or a boolean', () => {
    const same = { label: 'Same', to: { kind: 'list' as const, resource: 'holds', filter: 'task_id = {{verb}}' } }
    expect(rowButtonFor(same, model, holdsView, { id: 1, verb: '7' })?.label).toBe('Same')
    expect(rowButtonFor(same, model, holdsView, { id: 1, verb: '7 OR true' })).toBeUndefined()
  })

  it('shows each row the first choice whose fields it holds', () => {
    const lever = [
      { label: 'Error report', href: '{{report_url}}' },
      { label: '{{verb}}', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } },
      { label: 'Same state', to: { kind: 'list' as const, resource: 'holds', filter: 'state = "{{state}}"' } },
    ]
    expect(rowButtonFor(lever, model, holdsView, { id: 1, report_url: 'https://errors.example/e/1', task_id: 7, tab: 'Chat' })).toEqual({ label: 'Error report', href: 'https://errors.example/e/1' })
    expect(rowButtonFor(lever, model, holdsView, { id: 2, task_id: 7, tab: 'Chat', verb: 'Read' })).toEqual({ label: 'Read', to: { kind: 'record', resource: 'tasks', key: '7', tab: 'Chat' } })
    expect(rowButtonFor(lever, model, holdsView, { id: 3, state: 'waiting' })).toEqual({ label: 'Same state', to: { kind: 'list', resource: 'holds', filter: 'state = "waiting"' } })
    expect(rowButtonFor(lever, model, holdsView, { id: 4 })).toBeUndefined()
  })

  it('shows no button when the chosen href holds no https URL, rather than the next choice', () => {
    const lever = [{ label: 'Error report', href: '{{report_url}}' }, { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}' } }]
    expect(rowButtonFor(lever, model, holdsView, { id: 1, report_url: 'ftp://errors.example', task_id: 7 })).toBeUndefined()
  })

  it('shows no button on a row without a value for a field it names', () => {
    expect(rowButtonFor(review, model, holdsView, { id: 1, task_id: null })).toBeUndefined()
    expect(rowButtonFor({ ...review, label: '{{verb}}' }, model, holdsView, { id: 1, task_id: 7, verb: '' })).toBeUndefined()
  })

  it("takes the label from the row's fields, an enum value by its label", () => {
    expect(rowButtonFor({ ...review, label: '{{verb}}' }, model, holdsView, { id: 1, task_id: 7, verb: 'Approve' })?.label).toBe('Approve')
    expect(rowButtonFor({ ...review, label: '{{state}}' }, model, holdsView, { id: 1, task_id: 7, state: 'needs_review' })?.label).toBe('Review')
  })
})
