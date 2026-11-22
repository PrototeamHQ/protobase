import { afterEach, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { declaredCheckProblem, withDeclaredChecks } from './declared-checks'
import { buildRegistry } from './registry'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), title: f.text() })
  .primaryKey((r) => r.id)
  .checks({ tasks_parked_by_hand: { label: '{title} waits for a day, so it stays parked.' } })
const registry = buildRegistry([tasks])

/** An error as the database driver throws it: a message, a SQLSTATE and the constraint it names. */
const violation = (constraint: string | undefined, code = '23514') =>
  Object.assign(new Error('Task 7 (secret) is not parked by hand'), { code, ...(constraint !== undefined && { constraint }), detail: 'secret detail', hint: 'secret hint' })

afterEach(() => vi.restoreAllMocks())

describe('declaredCheckProblem', () => {
  it('answers a declared check with a 400 naming it as the code, its label from the config and nothing from the database', () => {
    const problem = declaredCheckProblem(registry, violation('tasks_parked_by_hand'))!
    expect(problem).toMatchObject({ status: 400, slug: 'invalid-record', extras: { errors: [{ field: '_record', code: 'tasks_parked_by_hand', message: '{title} waits for a day, so it stays parked.' }] } })
    expect(JSON.stringify({ detail: problem.detail, extras: problem.extras })).not.toContain('secret')
  })

  it('reads the constraint from the driver error a wrapper keeps as its cause', () => {
    const wrapped = Object.assign(new Error('the write failed'), { code: '23514', cause: violation('tasks_parked_by_hand') })
    expect(declaredCheckProblem(registry, wrapped)?.extras).toMatchObject({ errors: [{ code: 'tasks_parked_by_hand' }] })
  })

  it('leaves an undeclared check to the generic 400, logging only its name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(declaredCheckProblem(registry, violation('tasks_amount_positive'))).toBeUndefined()
    expect(warn).toHaveBeenCalledWith('A database check the config does not declare refused a write: tasks_amount_positive')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
  })

  it('leaves a plain raise with the same constraint name, and any other error, alone', () => {
    expect(declaredCheckProblem(registry, violation('tasks_parked_by_hand', 'P0001'))).toBeUndefined()
    expect(declaredCheckProblem(registry, new Error('tasks_parked_by_hand'))).toBeUndefined()
  })
})

describe('withDeclaredChecks', () => {
  it('throws a declared check as its 400, and any other error as it is', async () => {
    await expect(withDeclaredChecks(registry, async () => { throw violation('tasks_parked_by_hand') })).rejects.toMatchObject({ status: 400, slug: 'invalid-record' })
    const other = violation(undefined, '23505')
    await expect(withDeclaredChecks(registry, async () => { throw other })).rejects.toBe(other)
  })
})

describe('the registry', () => {
  it('refuses a check name two resources declare', () => {
    const other = resource('preconditions').table('preconditions').fields({ id: f.integer() }).primaryKey((r) => r.id).checks({ tasks_parked_by_hand: { label: 'Again' } })
    expect(() => buildRegistry([tasks, other])).toThrow('Check "tasks_parked_by_hand" is declared by both tasks and preconditions')
  })
})
