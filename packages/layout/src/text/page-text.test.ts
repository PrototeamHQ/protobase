import { describe, expect, it } from 'vitest'
import { CardRow, Field, Match, Page, RecordCard, Show, Switch, Table } from '../blocks'
import { compileReadPlan } from '../compile-read-plan'
import { RecordsIterator, ReferenceManyField } from '../list-blocks'
import type { LayoutNode } from '../node'
import type { PlanRead } from '../read-plan'
import type { PlanResult } from '../run-plan'
import { nested } from '../testing/models'
import { pageText } from './page-text'

// Open tasks in a row of cards, each with its claims, and the claims' steps under each claim
const steps = ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', empty: 'No steps yet', children: RecordsIterator({ children: Field({ source: 'name', label: false }) }) })
const claims = ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 5, children: RecordsIterator({ children: [Field({ source: 'status' }), steps] }) })
const tasks = CardRow({ resource: 'tasks', title: 'Open tasks', filter: "status = 'open'", limit: 10, children: [Field({ source: 'title' }), claims] })

const rows: Record<string, Record<string, unknown>[]> = {
  tasks: [{ id: 1, title: 'Ship it' }, { id: 2, title: 'Test it' }],
  task_claims: [{ id: 11, task_id: 1, status: 'done' }, { id: 12, task_id: 1, status: 'open' }],
  claim_steps: [{ id: 21, claim_id: 11, name: 'plan' }, { id: 22, claim_id: 11, name: 'build' }],
  workers: [{ id: 3, name: 'Ann' }],
}

// Reads that answer only once every read has started, so a read that waited for another would never answer
const waitingReads = (expected: number) => {
  const started: PlanRead[] = []
  const release: Array<() => void> = []
  const read = (planned: PlanRead) => {
    started.push(planned)
    const answer = new Promise<PlanResult>((resolve) => release.push(() => resolve({ rows: rows[planned.resource] ?? [] })))
    if (started.length === expected) for (const resolve of release) resolve()
    return answer
  }
  return { started, read }
}

const textOf = async (tree: LayoutNode, expected: number) => {
  const { plan } = compileReadPlan(tree, { models: nested })
  expect(plan.reads).toHaveLength(expected)
  const reads = waitingReads(expected)
  return { text: await pageText(tree, plan, { read: reads.read }), started: reads.started }
}

describe('pageText', () => {
  it('reads every record of a two-level page, with all reads started at once', async () => {
    const { text, started } = await textOf(Page({ title: 'Tasks', children: tasks }), 3)
    expect(started.map((read) => read.resource)).toEqual(['tasks', 'task_claims', 'claim_steps'])
    expect(text).toBe(
      [
        '# Tasks',
        '### [Open tasks](/tasks?filter=status+%3D+%27open%27)',
        '**title**: Ship it',
        '**status**: done',
        'plan',
        'build',
        '**status**: open',
        'No steps yet',
        '**title**: Test it',
      ].join('\n\n'),
    )
  })

  it("reads a RecordCard's record and a table's rows, and starts the reads under a false Show and an unmatched Match too", async () => {
    const tree = Page({
      title: 'Home',
      children: [
        RecordCard({ resource: 'tasks', recordKey: '1', children: Field({ source: 'title' }) }),
        Show({ when: "status = 'never'", children: Table({ resource: 'workers', columns: ['name'] }) }),
        Switch({ children: [Match({ when: "status = 'never'", children: Table({ resource: 'claim_steps', columns: ['name'] }) })] }),
      ],
    })
    const { text, started } = await textOf(tree, 3)
    expect(started.map((read) => read.resource)).toEqual(['tasks', 'workers', 'claim_steps'])
    expect(text).toContain('**title**: Ship it')
  })

  it('reads a table as the rows its read gave, under the labels of their fields', async () => {
    const tree = Page({ title: 'Team', children: Table({ resource: 'workers', title: 'Workers', columns: ['name'] }) })
    const { plan } = compileReadPlan(tree, { models: nested })
    const text = await pageText(tree, plan, { read: async () => ({ rows: rows.workers! }), labels: { workers: { name: { label: 'Name' } } } })
    expect(text).toBe('# Team\n\n### [Workers](/workers)\n\n| Name |\n| --- |\n| Ann |')
  })

  it('reads a block whose read failed as it reads without records', async () => {
    const tree = Page({ title: 'Tasks', children: tasks })
    const { plan } = compileReadPlan(tree, { models: nested })
    const text = await pageText(tree, plan, { read: async (planned) => (planned.resource === 'task_claims' ? Promise.reject(new Error('refused')) : { rows: rows[planned.resource]! }) })
    expect(text).toContain('[task\\_claims](/task_claims?filter=task_id+%3D+1)')
  })
})
