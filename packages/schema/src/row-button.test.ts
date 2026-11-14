import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { followableRowButton, rowButtonErrors, rowButtonFields } from './row-button'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id).toModel()
const holds = resource('holds')
  .table('holds')
  .fields({ id: f.integer(), task_id: f.relation('tasks').filterable(), verb: f.text().filterable(), tab: f.text(), report_url: f.text() })
  .primaryKey((r) => r.id)
  .toModel()
const models = { tasks, holds }

describe('rowButtonFields', () => {
  it('names the fields its label and address read, once each', () => {
    expect(rowButtonFields({ label: '{{verb}}', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}', tab: 'Review' } })).toEqual(['verb', 'task_id'])
    expect(rowButtonFields({ label: 'Open {{verb}}', to: { kind: 'record', resource: 'holds', key: '{{id}}', run: '{{verb}}' } })).toEqual(['verb', 'id'])
    expect(rowButtonFields({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } })).toEqual(['task_id', 'tab'])
    expect(rowButtonFields({ label: '{{verb}}', href: '{{report_url}}' })).toEqual(['verb', 'report_url'])
    expect(rowButtonFields([{ label: '{{verb}}', href: '{{report_url}}' }, { label: '{{verb}}', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}' } }])).toEqual(['verb', 'report_url', 'task_id'])
  })
})

describe('rowButtonErrors', () => {
  it('accepts a label and an address whose fields the rows have', () => {
    expect(rowButtonErrors({ label: '{{verb}}', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}', tab: 'Review' } }, holds, { models })).toEqual([])
  })

  it("accepts a tab or a list filter taken from the row's fields", () => {
    expect(rowButtonErrors({ label: 'Open', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } }, holds, { models })).toEqual([])
    expect(rowButtonErrors({ label: 'Same verb', to: { kind: 'list', resource: 'holds', filter: 'verb = "{{verb}}" AND task_id = {{task_id}}' } }, holds, { models })).toEqual([])
  })

  it('refuses a field inside a longer quoted value of a filter', () => {
    expect(rowButtonErrors({ label: 'Same', to: { kind: 'list', resource: 'holds', filter: "verb = 're {{verb}}'" } }, holds, { models })).toEqual([
      'to: filter: "{{verb}}" sits inside a longer quoted value; quote it alone, such as title = "{{verb}}"',
    ])
  })

  it('accepts an outside page from a field the rows have', () => {
    expect(rowButtonErrors({ label: 'Report', href: '{{report_url}}' }, holds, { models })).toEqual([])
    expect(rowButtonErrors({ label: 'Report', href: '{{url}}' }, holds, { models })).toEqual(['href: "{{url}}" is not a field of holds'])
  })

  it('takes an href only as one field, and not beside an address', () => {
    const one = "href: a row button's href is the one field that holds the page's https URL, such as '{{report_url}}'"
    expect(rowButtonErrors({ label: 'Report', href: 'https://errors.example/{{id}}' }, holds, { models })).toEqual([one])
    expect(rowButtonErrors({ label: 'Report', href: 7 }, holds, { models })).toEqual([one])
    expect(rowButtonErrors({ label: 'Report', href: '{{report_url}}', to: { kind: 'page', page: 'today' } }, holds, { models })).toEqual(['a row button opens an address in `to` or an outside page in `href`, not both'])
  })

  it('names a label or an address field the rows do not have', () => {
    expect(rowButtonErrors({ label: '{{action}}', to: { kind: 'record', resource: 'tasks', key: '{{task}}' } }, holds, { models })).toEqual([
      'label: "{{action}}" is not a field of holds',
      'to: "{{task}}" is not a field of holds',
    ])
  })

  it('names an address that cannot be followed', () => {
    expect(rowButtonErrors({ label: 'Open', to: { kind: 'record', resource: 'bikes', key: '{{id}}' } }, holds, { models })).toEqual(['to: unknown resource "bikes"'])
  })

  it('needs a label and an address', () => {
    expect(rowButtonErrors('Open', holds, { models })[0]).toMatch(/^a row button is \{ label, to \} or \{ label, href \}/)
    expect(rowButtonErrors({ label: ' ', to: { kind: 'page', page: 'today' } }, holds, { models })).toEqual(['a row button needs a label'])
    expect(rowButtonErrors({ label: 'Open' }, holds, { models })).toEqual(["a row button needs an address in `to`, such as { kind: 'record', resource: 'tasks', key: '{{id}}' }, or an outside page in `href`"])
  })

  it('checks each choice of a list, and needs one', () => {
    expect(rowButtonErrors([{ label: 'Report', href: '{{report_url}}' }, { label: 'Open', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } }], holds, { models })).toEqual([])
    expect(rowButtonErrors([{ label: 'Report', href: '{{url}}' }, { label: 'Open', to: { kind: 'record', resource: 'bikes', key: '{{id}}' } }], holds, { models })).toEqual([
      'choice 1: href: "{{url}}" is not a field of holds',
      'choice 2: to: unknown resource "bikes"',
    ])
    expect(rowButtonErrors([], holds, { models })).toEqual(['a row button list needs at least one choice'])
  })
})

describe('followableRowButton', () => {
  const report = { label: 'Report', href: '{{report_url}}' }
  const open = { label: 'Open', to: { kind: 'record' as const, resource: 'tasks', key: '{{task_id}}' } }

  it('keeps the choices the caller can follow, in order, and none when none is left', () => {
    expect(followableRowButton([report, open], holds, { models })).toEqual([report, open])
    expect(followableRowButton([report, open], holds, { models: { holds } })).toEqual([report])
    expect(followableRowButton(open, holds, { models: { holds } })).toBeUndefined()
    expect(followableRowButton([open], holds, { models: { holds } })).toBeUndefined()
    expect(followableRowButton(report, holds, { models })).toEqual(report)
  })
})
