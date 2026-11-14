import { describe, expect, it } from 'vitest'
import { resolveScopePath, type PathMode } from './scope-lookup'
import { nested as models } from './testing/models'
import type { Scope } from './walk'

const frame = (resource: string, repeated = false) => ({ resource, repeated, block: `<X resource="${resource}">` })

// A claim's row of a CardRow inside a task's RecordCard, on a page whose own record is a task
const claims: Scope = { stack: [frame('tasks'), frame('task_claims', true)] }
const rooted: Scope = { root: 'tasks', stack: [frame('task_claims', true)] }

const resolve = (path: string, scope: Scope, mode: PathMode = 'stored', params: string[] = []) => resolveScopePath(path, { models, scope, params: new Set(params), mode })

describe('resolveScopePath', () => {
  it('finds a bare name in the nearest record, an outer one, and only in @root', () => {
    expect(resolve('claimed_at', claims)).toMatchObject({ ok: true, kind: 'field', context: { at: 1, resource: 'task_claims' } })
    expect(resolve('title', claims)).toMatchObject({ ok: true, kind: 'field', context: { at: 0, resource: 'tasks' } })
    expect(resolve('title', rooted)).toMatchObject({ ok: true, kind: 'field', context: { at: 'root', resource: 'tasks' } })
  })

  it('reads the rest of a dotted name from where its first name is, never falling back outward', () => {
    expect(resolve('meta.size', claims)).toMatchObject({ ok: true, names: ['meta', 'size'] })
    // `status` is the claim's, which holds no names; the task's status is not tried
    expect(resolve('status.label', claims)).toEqual({ ok: false, message: '"status.label" reads into status, a text field of task_claims, which holds no names' })
    expect(resolve('worker.name', claims).ok).toBe(false)
    expect(resolve('worker.name', claims, 'relations')).toMatchObject({ ok: true, names: ['worker', 'name'] })
  })

  it('goes up with ../ and reads one record with this and ./', () => {
    expect(resolve('../id', claims)).toMatchObject({ ok: true, context: { at: 0, resource: 'tasks' } })
    const steps: Scope = { root: 'tasks', stack: [frame('task_claims'), frame('claim_steps', true)] }
    expect(resolve('../../id', steps)).toMatchObject({ ok: true, context: { at: 'root', resource: 'tasks' } })
    expect(resolve('this.claimed_at', claims)).toMatchObject({ ok: true, context: { at: 1 } })
    expect(resolve('./title', claims)).toEqual({ ok: false, message: '"./title": "title" is no field of task_claims' })
    expect(resolve('this', claims)).toMatchObject({ ok: true, kind: 'record' })
  })

  it('refuses ../ past the outermost record, @root without a page record, @index outside a CardRow and @params without a SelectInput', () => {
    expect(resolve('../../id', claims)).toEqual({ ok: false, message: '"../../id" goes up past the outermost record around it' })
    expect(resolve('@root.id', claims)).toEqual({ ok: false, message: '"@root.id": @root is the page\'s own record, and this page has none' })
    expect(resolve('@index', { stack: [frame('tasks')] })).toEqual({ ok: false, message: '"@index": @index counts the rows of a CardRow or RecordsIterator, and this sits in none' })
    expect(resolve('@index', claims)).toMatchObject({ ok: true, kind: 'data', variable: 'index' })
    expect(resolve('@params.window', claims)).toEqual({ ok: false, message: '"@params.window": no SelectInput source="window" on the page sets @params.window' })
    expect(resolve('@params.window', claims, 'stored', ['window'])).toMatchObject({ ok: true, kind: 'data', variable: 'params' })
    expect(resolve('title', { stack: [] })).toEqual({ ok: false, message: '"title" needs a record around it: put it inside a RecordCard, a CardRow or a RecordsIterator' })
  })

  it('names every record it searched and the closest field for a typo', () => {
    expect(resolve('claimd_at', rooted)).toEqual({ ok: false, message: '"claimd_at" is no field of task_claims, tasks (@root); did you mean claimed_at?' })
    expect(resolve('zzz', claims)).toEqual({ ok: false, message: '"zzz" is no field of task_claims, tasks' })
  })

  it('says which record a shadowed bare name reads and how to reach the others, and never for an explicit path', () => {
    expect(resolve('id', rooted)).toMatchObject({ ok: true, shadows: '"id" resolves to task_claims; write ../id or @root.id for the one of tasks (@root)' })
    expect(resolve('status', claims)).toMatchObject({ shadows: '"status" resolves to task_claims; write ../status for the one of tasks' })
    for (const path of ['this.id', './id', '../id', '@root.id']) expect(resolve(path, rooted)).not.toHaveProperty('shadows')
  })

  it('refuses what is no path', () => {
    expect(resolve('a b', claims)).toEqual({ ok: false, message: '"a b" is no path; write a field\'s name, ../name, this.name, @root.name, @params.name, @index, @first or @last' })
  })
})
