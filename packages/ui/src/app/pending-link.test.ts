import { describe, expect, it, vi } from 'vitest'
import { followLink, pendingLink } from './pending-link'

describe('pendingLink', () => {
  it('follows a confirmed link keeping the scroll when the link asked for that', () => {
    const go = vi.fn()
    followLink(pendingLink('/app/claims?task=2', { keepScroll: true }), go)
    expect(go).toHaveBeenCalledWith('/app/claims?task=2', false, true)
  })

  it('follows a confirmed link at the top and pushed by default', () => {
    const go = vi.fn()
    followLink(pendingLink('/app/tasks/2'), go)
    expect(go).toHaveBeenCalledWith('/app/tasks/2', false, false)
  })

  it('keeps a replacing link replacing', () => {
    const go = vi.fn()
    followLink(pendingLink('/app/tasks/2', { replace: true }), go)
    expect(go).toHaveBeenCalledWith('/app/tasks/2', true, false)
  })
})
