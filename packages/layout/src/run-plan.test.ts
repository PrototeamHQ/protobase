import { describe, expect, it } from 'vitest'
import type { PlanRead, ReadPlan } from './read-plan'
import { fillPlanRead, plannedRows, planReadResources, runReadPlan, type PlanResult } from './run-plan'

const tasks: PlanRead = { block: '/children/0', kind: 'list', resource: 'tasks', filter: 'status = "{{@params.state}}"', pageSize: 10, etag: false }
const claims: PlanRead = { block: '/children/0/children/0', kind: 'list', resource: 'task_claims', filter: 'related(task_id, tasks.id, (status = "{{@params.state}}"), "", 10)', split: { field: 'task_id', source: 'this.id', parent: '/children/0' }, etag: false }
const steps: PlanRead = { block: '/children/0/children/0/children/0', kind: 'list', resource: 'claim_steps', split: { field: 'claim_id', source: 'id', parent: '/children/0/children/0' }, etag: false }
const plan: ReadPlan = { reads: [tasks, claims, steps], outside: [] }

describe('runReadPlan', () => {
  it('starts every read of a two-level page before any of them resolves', async () => {
    const started: string[] = []
    const release: Array<() => void> = []
    const read = (planned: PlanRead) => {
      started.push(planned.resource)
      return new Promise<PlanResult>((resolve) => release.push(() => resolve({ rows: [] })))
    }
    const done = runReadPlan(plan, read, { params: { state: 'open' } })
    expect(started).toEqual(['tasks', 'task_claims', 'claim_steps'])
    for (const resolve of release) resolve()
    expect([...(await done).keys()]).toEqual(['/children/0', '/children/0/children/0', '/children/0/children/0/children/0'])
  })

  it('fills the address slots of every read, and lets a failed read fail alone', async () => {
    const filters: Array<string | undefined> = []
    const outcome = await runReadPlan(plan, async (planned) => {
      filters.push(planned.filter)
      if (planned.resource === 'claim_steps') throw new Error('refused')
      return { rows: [{ id: 1 }] }
    }, { params: { state: 'it\'s "done"' } })
    expect(filters[0]).toBe('status = "it\'s \\"done\\""')
    expect(outcome.get('/children/0')).toEqual({ status: 'fulfilled', value: { rows: [{ id: 1 }] } })
    expect(outcome.get('/children/0/children/0/children/0')?.status).toBe('rejected')
  })
})

describe('fillPlanRead', () => {
  it('leaves a read without a filter as it is', () => {
    expect(fillPlanRead(steps, { params: { state: 'open' } })).toBe(steps)
  })
})

describe('plannedRows', () => {
  const rows = [{ id: 11, task_id: 1 }, { id: 12, task_id: 2 }, { id: 13, task_id: 1 }]

  it('gives each record around it the rows of its own key, and a record without any none', () => {
    expect(plannedRows(claims, rows, { stack: [{ record: { id: 1 } }] }).map((row) => row.id)).toEqual([11, 13])
    expect(plannedRows(claims, rows, { stack: [{ record: { id: '2' } }] }).map((row) => row.id)).toEqual([12])
    expect(plannedRows(claims, rows, { stack: [{ record: { id: 3 } }] })).toEqual([])
  })

  it('gives every row to a read that splits on nothing', () => {
    expect(plannedRows(tasks, rows, { stack: [] })).toBe(rows)
  })

  it("takes the rows a JSON list of keys holds, in the read's order, and an aggregate's group by its value", () => {
    const waits: PlanRead = { ...claims, split: { field: 'id', source: 'waits', parent: '/children/0' } }
    expect(plannedRows(waits, rows, { stack: [{ record: { waits: [13, 11] } }] }).map((row) => row.id)).toEqual([11, 13])
    const counted: PlanRead = { ...claims, kind: 'aggregate', groupBy: ['task_id'] }
    expect(plannedRows(counted, [{ value: 1, count: 2 }, { value: 2, count: 1 }], { stack: [{ record: { id: 2 } }] })).toEqual([{ value: 2, count: 1 }])
  })
})

describe('planReadResources', () => {
  it('names the resources of the reads its related() terms carry', () => {
    expect(planReadResources(steps, plan)).toEqual(['claim_steps', 'task_claims', 'tasks'])
    expect(planReadResources(tasks, plan)).toEqual(['tasks'])
  })
})
