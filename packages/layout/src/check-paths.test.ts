import { describe, expect, it } from 'vitest'
import { Link, ModalForm, RecordCard, Table } from './blocks'
import { pathFindings } from './check-paths'
import { nested as models } from './testing/models'
import type { Scope } from './walk'

// Inside one task of a CardRow of tasks
const inTask: Scope = { stack: [{ resource: 'tasks', repeated: true, block: '<CardRow resource="tasks">' }] }

const findings = (node: ReturnType<typeof Table>, scope = inTask, params: string[] = []) => pathFindings(node, scope, { models, params: new Set(params) })
const claimsWhere = (filter: string) => Table({ resource: 'task_claims', filter })

describe('pathFindings', () => {
  it('takes a per-row slot as a top-level AND equality, quoted or bare', () => {
    expect(findings(claimsWhere(`task_id = {{id}} AND status = 'open'`))).toEqual({ problems: [], warnings: [] })
    expect(findings(claimsWhere(`status = "{{status}}"`)).problems).toEqual([])
    expect(findings(RecordCard({ resource: 'task_claims', recordKey: '{{id}}' })).problems).toEqual([])
  })

  it('refuses a per-row slot inside OR, with >=, or as a second per-row condition', () => {
    const waits = (path: string) => `filter: "{{${path}}}" sits where a read cannot split it per row; only field = {{${path}}} as a top-level AND condition can, and this would wait for the parent's rows`
    expect(findings(claimsWhere('task_id = {{id}} OR status = "open"')).problems).toEqual([waits('id')])
    expect(findings(claimsWhere('task_id >= {{id}}')).problems).toEqual([waits('id')])
    expect(findings(claimsWhere('NOT task_id = {{id}}')).problems).toEqual([waits('id')])
    expect(findings(claimsWhere(`task_id = {{id}} AND status = '{{status}}'`)).problems).toEqual([
      `filter: "{{status}}" is a second per-row condition, and a read splits by one; this would wait for the parent's rows`,
    ])
    expect(findings(RecordCard({ resource: 'task_claims', recordKey: 'k-{{id}}' })).problems).toHaveLength(1)
  })

  it('takes a page parameter anywhere in a filter, and refuses @index and this, which no read stores', () => {
    expect(findings(claimsWhere('claimed_at >= {{@params.since}}'), inTask, ['since']).problems).toEqual([])
    expect(findings(claimsWhere('task_id = {{@index}}')).problems).toEqual(['filter: "{{@index}}" is no stored field of a record, so a read cannot take it'])
    expect(findings(claimsWhere('task_id = {{this}}')).problems).toEqual(['filter: "{{this}}" is no stored field of a record, so a read cannot take it'])
  })

  it('refuses a slot in what shapes a read, and takes one in a link, which reads nothing', () => {
    const shapes = (prop: string) => `"${prop}" shapes the read and takes no {{…}}; this would wait for the parent's rows`
    expect(findings(Table({ resource: '{{title}}' })).problems).toContain(shapes('resource'))
    expect(findings(Table({ resource: 'task_claims', sort: '{{status}}' })).problems).toEqual([shapes('sort')])
    expect(findings(Table({ resource: 'task_claims', sort: '{{@params.order}}' }), inTask, ['order']).problems).toEqual([shapes('sort')])
    expect(findings(Table({ resource: 'task_claims', columns: ['{{title}}'] })).problems).toEqual([shapes('columns')])
    expect(findings(Link({ to: { kind: 'list', resource: '{{title}}' }, children: 'Open' })).problems).toEqual([])
  })

  it('lets a text prop read any path, row counters included, and checks it', () => {
    expect(findings(Table({ resource: 'task_claims', title: 'Claims of {{title}}, row {{@index}}', empty: '{{@first}}' })).problems).toEqual([])
    expect(findings(Table({ resource: 'task_claims', title: 'Claims of {{titel}}' })).problems).toEqual(['title: "titel" is no field of tasks; did you mean title?'])
    expect(findings(Table({ resource: 'task_claims', title: '{{@index}}' }), { stack: [{ resource: 'tasks', repeated: false, block: '<RecordCard>' }] }).problems).toHaveLength(1)
  })

  it('warns of a shadowed bare name and takes values as a whole placeholder', () => {
    const inClaim: Scope = { stack: [...inTask.stack, { resource: 'task_claims', repeated: true, block: '<CardRow resource="task_claims">' }] }
    expect(findings(Table({ resource: 'claim_steps', title: '{{status}}' }), inClaim).warnings).toEqual(['title: "status" resolves to task_claims; write ../status for the one of tasks'])
    expect(findings(Table({ resource: 'claim_steps', title: '{{this.status}} {{../status}}' }), inClaim).warnings).toEqual([])
    expect(findings(ModalForm({ mode: 'create', label: 'Add', resource: 'claim_steps', fields: ['name'], values: { claim_id: '{{id}}' } }), inClaim).problems).toEqual([])
  })
})
