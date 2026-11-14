import { describe, expect, it, vi } from 'vitest'
import { CustomBoundary } from './custom-boundary'

// What it draws from, before and after the app read /meta again, as a model object
const stale = { fields: ['definition'] }
const fresh = { fields: ['state_machine', 'trigger'] }

const failedBoundary = (resetKey: unknown) => {
  const boundary = new CustomBoundary({ name: 'surface', fallback: 'form', resetKey, children: 'graph' })
  boundary.state = CustomBoundary.getDerivedStateFromError()
  boundary.setState = vi.fn()
  return boundary
}

describe('CustomBoundary', () => {
  it('draws a component that threw again once what it draws from changes, and not before', () => {
    const same = failedBoundary(stale)
    same.componentDidUpdate({ name: 'surface', fallback: 'form', resetKey: stale, children: 'graph' })
    expect(same.setState).not.toHaveBeenCalled()
    expect(same.render()).toBe('form')
    const renewed = failedBoundary(fresh)
    renewed.componentDidUpdate({ name: 'surface', fallback: 'form', resetKey: stale, children: 'graph' })
    expect(renewed.setState).toHaveBeenCalledWith({ failed: false })
  })
})
