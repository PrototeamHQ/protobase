import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { CardRow, Page, RecordCard, Show, page } from '@protobase/layout'
import { checkPageScopes } from './page-scope-check'

const model = (name: string, fields: string[]) => ({ name, table: { name }, primaryKey: ['id'], fields: Object.fromEntries(fields.map((field) => [field, { name: field, column: field, type: 'text' }])) }) as unknown as ResourceModel
const models = [model('tasks', ['id', 'status']), model('task_claims', ['id', 'task_id', 'status'])]

const board = (when: string) =>
  page('board', Page({ title: 'Board', children: RecordCard({ resource: 'tasks', children: CardRow({ resource: 'task_claims', filter: 'task_id = {{id}}', children: Show({ when, children: 'Open' }) }) }) })).toModel()

describe('checkPageScopes', () => {
  it('warns of a shadowed name, and fails on it with strict', () => {
    const warnings: string[] = []
    checkPageScopes([board("status = 'open'")], models, { onWarning: (warning) => warnings.push(warning) })
    expect(warnings).toEqual(['Page "board": <Page> › <RecordCard resource="tasks"> › <CardRow resource="task_claims"> › <Show>: "when": "status" resolves to task_claims; write ../status for the one of tasks'])
    expect(() => checkPageScopes([board("status = 'open'")], models, { strict: true })).toThrow('--strict refuses')
  })

  it('passes a page that names each record explicitly', () => {
    expect(() => checkPageScopes([board("this.status = '{{../status}}'")], models, { strict: true })).not.toThrow()
  })
})
