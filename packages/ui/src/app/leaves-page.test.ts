import { describe, expect, it } from 'vitest'
import { leavesPage } from './leaves-page'

describe('leavesPage', () => {
  it('leaves for another path, guards or none', () => {
    expect(leavesPage('/app/tasks/1', '/app/tasks/2', [])).toBe(true)
  })

  it('stays on a query change no guard watches, such as a record tab', () => {
    expect(leavesPage('/app/tasks/1?tab=Notes', '/app/tasks/1?tab=Claims', [{ params: [] }])).toBe(false)
    expect(leavesPage('/app/claims?task=1&window=7d', '/app/claims?task=1&window=30d', [{ params: ['task'] }])).toBe(false)
  })

  it('leaves when a parameter a guard watches changes or goes', () => {
    expect(leavesPage('/app/claims?task=1', '/app/claims?task=2', [{ params: ['task'] }])).toBe(true)
    expect(leavesPage('/app/claims?task=1', '/app/claims', [{ params: [] }, { params: ['task'] }])).toBe(true)
  })
})
