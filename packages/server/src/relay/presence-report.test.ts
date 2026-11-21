import { describe, expect, it } from 'vitest'
import { presenceReport } from './presence-report'

const change = { user: 'u1', status: 'away', at: 1795200000000 }

describe('presenceReport', () => {
  it('takes a report as the relay sends it', () => {
    expect(presenceReport({ started: 1795190000000, changes: [change] })).toEqual({ started: 1795190000000, changes: [change] })
  })

  it('refuses a body that is no report', () => {
    expect(() => presenceReport([])).toThrow('The body is { started, changes')
    expect(() => presenceReport({ started: '1795190000000', changes: [] })).toThrow('started is a time in milliseconds')
    expect(() => presenceReport({ started: 1 })).toThrow('changes is a list')
  })

  it('refuses a change without a user, with a status the relay does not report, or without a time', () => {
    expect(() => presenceReport({ started: 1, changes: [{ ...change, user: '' }] })).toThrow("A change's user is a user id")
    expect(() => presenceReport({ started: 1, changes: [{ ...change, status: 'busy' }] })).toThrow("A change's status is one of online, away, offline")
    expect(() => presenceReport({ started: 1, changes: [{ ...change, at: 1.5 }] })).toThrow("A change's at is a time in milliseconds")
  })

  it('refuses more changes than the relay batches', () => {
    expect(() => presenceReport({ started: 1, changes: Array.from({ length: 501 }, () => change) })).toThrow('A report holds at most 500 changes')
  })
})
