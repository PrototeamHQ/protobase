import { describe, expect, it, vi } from 'vitest'
import { createFocusStore } from './focus-store'

describe('createFocusStore', () => {
  it('shows the notice that matters most, and the next once it clears', () => {
    const store = createFocusStore()
    store.setNotice('run', 'info')
    store.setNotice('draft', 'draft')
    store.setNotice('save', 'refused')
    expect(store.notice()).toBe('save')
    store.setNotice('save', undefined)
    expect(store.notice()).toBe('draft')
  })

  it('lists every part\'s actions in the order the parts came, and tells its listeners', () => {
    const store = createFocusStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const action = (name: string) => ({ name, icon: (() => null) as never })
    store.setActions('surface', [action('Test run')])
    store.setActions('record', [action('Delete')])
    expect(store.actions().map(({ name }) => name)).toEqual(['Test run', 'Delete'])
    store.setActions('surface', undefined)
    expect(store.actions().map(({ name }) => name)).toEqual(['Delete'])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('knows a zone is filled until the last part in it leaves', () => {
    const store = createFocusStore()
    const first = store.fill('primary')
    const second = store.fill('primary')
    first()
    expect(store.filled('primary')).toBe(true)
    second()
    expect(store.filled('primary')).toBe(false)
  })
})
