import { describe, expect, it } from 'vitest'
import { checksState, reviewBotFinished, type CheckRun, type WorkflowRun } from './checks'

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  name: 'ci',
  event: 'pull_request',
  workflow_id: 1,
  check_suite_id: 10,
  status: 'completed',
  conclusion: 'success',
  ...over,
})
const check = (over: Partial<CheckRun> = {}): CheckRun => ({ name: 'test', status: 'completed', conclusion: 'success', check_suite: { id: 10 }, ...over })
const own = 9

describe('reviewBotFinished', () => {
  const bot = { name: 'CodeRabbit', app: { slug: 'coderabbitai' } }

  it('takes a passed check of that name from the app', () => {
    expect(reviewBotFinished([check(bot)])).toBe(true)
  })

  it('refuses a check still running, another outcome and another app under its name', () => {
    expect(reviewBotFinished([check({ ...bot, status: 'in_progress', conclusion: null })])).toBe(false)
    expect(reviewBotFinished([check({ ...bot, conclusion: 'failure' })])).toBe(false)
    expect(reviewBotFinished([check({ name: 'CodeRabbit', app: { slug: 'someone' } })])).toBe(false)
    expect(reviewBotFinished([])).toBe(false)
  })
})

describe('checksState', () => {
  it('is green when all passed, skipped and neutral count', () => {
    const checks = [check(), check({ conclusion: 'skipped' }), check({ conclusion: 'neutral' })]
    expect(checksState([run()], checks, [{ context: 'bot', state: 'success' }], own)).toEqual({ state: 'green', names: [] })
  })

  it('is pending while a run is queued, a check runs or a status waits', () => {
    expect(checksState([run({ status: 'queued', conclusion: null })], [], [], own).state).toBe('pending')
    expect(checksState([run()], [check({ status: 'in_progress', conclusion: null })], [], own).state).toBe('pending')
    expect(checksState([run()], [], [{ context: 'bot', state: 'pending' }], own).state).toBe('pending')
  })

  it('is pending with nothing on the head yet', () => {
    expect(checksState([], [], [], own).state).toBe('pending')
  })

  it('is red for a failure, a cancelled run and an errored status, by name', () => {
    expect(checksState([run()], [check({ conclusion: 'failure' })], [], own)).toEqual({ state: 'red', names: ['test'] })
    expect(checksState([run({ conclusion: 'cancelled' })], [], [], own).state).toBe('red')
    expect(checksState([run()], [], [{ context: 'bot', state: 'error' }], own).state).toBe('red')
  })

  it('leaves its own workflow out, running or not', () => {
    const mine = run({ name: 'auto-merge-approvals', workflow_id: own, check_suite_id: 20, status: 'in_progress', conclusion: null })
    const job = check({ name: 'merge', status: 'in_progress', conclusion: null, check_suite: { id: 20 } })
    expect(checksState([mine, run()], [check(), job], [], own).state).toBe('green')
  })

  it('counts only the newest run of a workflow for an event', () => {
    const rerun = [run({ check_suite_id: 11 }), run({ conclusion: 'failure' })]
    expect(checksState(rerun, [check({ check_suite: { id: 11 } }), check({ conclusion: 'failure' })], [], own).state).toBe('green')
  })

  it('leaves out a run waiting for approval when the workflow ran for another event', () => {
    const runs = [run({ conclusion: 'action_required', check_suite_id: 11 }), run({ event: 'push' })]
    expect(checksState(runs, [], [], own).state).toBe('green')
    expect(checksState([run({ conclusion: 'action_required' })], [], [], own).state).toBe('red')
  })
})
