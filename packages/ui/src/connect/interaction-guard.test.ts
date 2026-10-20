import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowDelayMs, armAfterFocus, isFramed, pressGate, type GuardDocument } from './interaction-guard'

afterEach(() => void vi.useRealTimers())

// A document whose visibility and focus the test sets, with the events a browser would send.
const fakeDocument = () => {
  const listeners = new Map<string, Set<() => void>>()
  const target = (prefix: string) => ({
    addEventListener: (type: string, listener: () => void) => void (listeners.get(`${prefix}${type}`) ?? listeners.set(`${prefix}${type}`, new Set()).get(`${prefix}${type}`)!).add(listener),
    removeEventListener: (type: string, listener: () => void) => void listeners.get(`${prefix}${type}`)?.delete(listener),
  })
  const state = { visible: true, focused: true }
  const doc: GuardDocument = {
    ...target('document:'),
    get visibilityState() {
      return state.visible ? 'visible' : 'hidden'
    },
    hasFocus: () => state.focused,
    defaultView: target('window:'),
  }
  const send = (name: string) => listeners.get(name)?.forEach((listener) => listener())
  return {
    doc,
    listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    blur: () => ((state.focused = false), send('window:blur')),
    focus: () => ((state.focused = true), send('window:focus')),
    hide: () => ((state.visible = false), send('document:visibilitychange')),
    show: () => ((state.visible = true), send('document:visibilitychange')),
  }
}

describe('isFramed', () => {
  it('is whether the top window is another', () => {
    const own = { top: undefined as unknown, self: undefined as unknown }
    own.top = own
    own.self = own
    expect(isFramed(own)).toBe(false)
    expect(isFramed({ top: {}, self: own })).toBe(true)
  })
})

describe('armAfterFocus', () => {
  it('arms only after the page has been visible and focused for the delay', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true])
  })

  it('waits again from the start after a blur, and disarms at once', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(400)
    page.blur()
    page.focus()
    vi.advanceTimersByTime(400)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(100)
    expect(changes).toEqual([true])
    page.blur()
    expect(changes).toEqual([true, false])
    page.focus()
    vi.advanceTimersByTime(allowDelayMs)
    expect(changes).toEqual([true, false, true])
  })

  it('disarms when the page is hidden, and arms again once shown for the delay', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(allowDelayMs)
    page.hide()
    expect(changes).toEqual([true, false])
    page.show()
    vi.advanceTimersByTime(allowDelayMs)
    expect(changes).toEqual([true, false, true])
  })

  it('never arms a page without focus', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    page.blur()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(10 * allowDelayMs)
    expect(changes).toEqual([])
  })

  it('removes every listener and its timer on cleanup', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    const cleanup = armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    expect(page.listening()).toBe(3)
    cleanup()
    expect(page.listening()).toBe(0)
    vi.advanceTimersByTime(allowDelayMs)
    expect(changes).toEqual([])
  })
})

describe('pressGate', () => {
  it('lets through a press that began armed, once', () => {
    const gate = pressGate()
    gate.down(true)
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)
  })

  it('stops a press that began before arming, though it ends after', () => {
    const gate = pressGate()
    gate.down(false)
    expect(gate.take()).toBe(false)
  })

  it('stops a click without a press on the button, and a repeating key', () => {
    const gate = pressGate()
    expect(gate.take()).toBe(false)
    gate.down(true, true)
    expect(gate.take()).toBe(false)
  })
})
