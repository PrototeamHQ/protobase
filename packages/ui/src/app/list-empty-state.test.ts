import { describe, expect, it } from 'vitest'
import { listEmptyState } from './list-empty-state'

const none = { plural: 'Companies', search: '', filtered: false, scoped: false, canCreate: true }

describe('listEmptyState', () => {
  it('names the search, offering to clear it', () => {
    expect(listEmptyState({ ...none, search: 'zzzqqq' })).toEqual({ message: 'No companies match “zzzqqq”.', clearSearch: true, clearFilters: false, create: false })
  })

  it('offers to clear the filters too when both are set', () => {
    expect(listEmptyState({ ...none, search: 'zzzqqq', filtered: true })).toEqual({ message: 'No companies match “zzzqqq”.', clearSearch: true, clearFilters: true, create: false })
  })

  it('says the filters match nothing, offering to clear them', () => {
    expect(listEmptyState({ ...none, filtered: true })).toEqual({ message: 'No companies match these filters.', clearSearch: false, clearFilters: true, create: false })
  })

  it('offers nothing for a scope it cannot clear', () => {
    expect(listEmptyState({ ...none, scoped: true })).toEqual({ message: 'No companies match.', clearSearch: false, clearFilters: false, create: false })
  })

  it('says there are none yet, offering New to a user who may create', () => {
    expect(listEmptyState(none)).toEqual({ message: 'No companies yet.', clearSearch: false, clearFilters: false, create: true })
    expect(listEmptyState({ ...none, canCreate: false }).create).toBe(false)
  })
})
