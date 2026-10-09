import { describe, expect, it } from 'vitest'
import { approval, approveLabel, formatCell, formatCredits, queueText, waitingText, type Plan } from './model'

const plan: Plan = { taskId: 't1', revision: 1, summary: 'Add a discount', steps: [], migrations: [], risks: [], size: 'S', credits: 3, outdated: false, waiting: 0, status: 'awaiting' }

describe('approval', () => {
  it('is enabled when the balance covers the quote', () => {
    expect(approval(plan, 3)).toEqual({ enabled: true })
  })
  it('is disabled below the quote, with the reason', () => {
    expect(approval(plan, 2)).toEqual({ enabled: false, reason: 'Needs 3 credits; the balance is 2 credits.' })
  })
  it('is disabled once the plan is answered or dropped', () => {
    for (const status of ['approved', 'canceled', 'superseded', 'dropped'] as const) expect(approval({ ...plan, status }, 100)).toEqual({ enabled: false })
  })
})

describe('approveLabel', () => {
  it('carries the price, and says "anyway" when the branch moved', () => {
    expect(approveLabel(plan)).toBe('Approve · 3 credits')
    expect(approveLabel({ ...plan, outdated: true, credits: 1 })).toBe('Approve anyway · 1 credit')
  })
})

describe('queue texts', () => {
  it('says where a waiting task stands', () => {
    expect(queueText(0, false)).toBe('Next in line.')
    expect(queueText(1, false)).toBe('Waiting, 1 task ahead.')
    expect(queueText(3, false)).toBe('Waiting, 3 tasks ahead.')
    expect(queueText(2, true)).toBe('Waiting for the plan above to be approved or canceled.')
  })
  it('says how many tasks wait on an unanswered plan', () => {
    expect(waitingText(0)).toBeUndefined()
    expect(waitingText(1)).toBe('1 task waits on this plan.')
    expect(waitingText(2)).toBe('2 tasks wait on this plan.')
  })
})

describe('formatCell', () => {
  it('keeps null visible and shows objects as JSON', () => {
    expect([null, undefined, 42, 'a', true, { a: 1 }, [1, 2]].map(formatCell)).toEqual(['null', 'null', '42', 'a', 'true', '{"a":1}', '[1,2]'])
  })
})

it('formatCredits', () => {
  expect([0, 1, 30].map(formatCredits)).toEqual(['0 credits', '1 credit', '30 credits'])
})
