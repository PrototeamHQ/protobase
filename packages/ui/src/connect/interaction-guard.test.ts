import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowDelayMs, armAfterFocus, armedState, isFramed, pressGate, type GuardDocument } from './interaction-guard'

afterEach(() => void vi.useRealTimers())

// A document whose visibility and focus the test sets, with the events a browser would send. A listener is keyed by its
// type and capture flag, as a browser removes one only when both match.
const fakeDocument = ({ withWindow = true } = {}) => {
  type Listener = (event: Event) => void
  const listeners = new Map<string, Set<Listener>>()
  const key = (prefix: string, type: string, capture?: boolean) => `${prefix}${type}:${capture === true}`
  const target = (prefix: string) => ({
    addEventListener: (type: string, listener: Listener, capture?: boolean) => {
      const name = key(prefix, type, capture)
      ;(listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(listener)
    },
    removeEventListener: (type: string, listener: Listener, capture?: boolean) => void listeners.get(key(prefix, type, capture))?.delete(listener),
  })
  const state = { visible: true, focused: true }
  const doc: GuardDocument = {
    ...target('document:'),
    get visibilityState() {
      return state.visible ? 'visible' : 'hidden'
    },
    hasFocus: () => state.focused,
    defaultView: withWindow ? target('window:') : null,
  }
  const send = (name: string, event: object = {}) => listeners.get(name)?.forEach((listener) => listener(event as Event))
  return {
    doc,
    listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    blur: () => ((state.focused = false), send('window:blur:false')),
    focus: () => ((state.focused = true), send('window:focus:false')),
    hide: () => ((state.visible = false), send('document:visibilitychange:false')),
    show: () => ((state.visible = true), send('document:visibilitychange:false')),
    /** A press reaching the document, capture first, then bubbling; `captureOnly` as when a handler below stops it. */
    press: (type: 'pointerdown' | 'keydown', init: object = {}, { captureOnly = false } = {}) => {
      send(`document:${type}:true`, { type, ...init })
      if (!captureOnly) send(`document:${type}:false`, { type, ...init })
    },
    /** A `pageshow`, as when the page comes back from the back-forward cache (`persisted`) or loads. */
    restore: (persisted: boolean) => ((state.visible = true), send('window:pageshow:false', { type: 'pageshow', persisted })),
    /** A `pageshow` that arrives while the page is still hidden. */
    shownHidden: (persisted: boolean) => send('window:pageshow:false', { type: 'pageshow', persisted }),
    pagehide: (persisted: boolean) => send('window:pagehide:false', { type: 'pagehide', persisted }),
  }
}

type Page = ReturnType<typeof fakeDocument>

// Presses every 100 ms for 1.5 s, alternating pointerdown and keydown unless `press` sends others.
const pressFast = (page: Page, press: (page: Page, index: number) => void = (p, i) => p.press(i % 2 ? 'keydown' : 'pointerdown')) => {
  for (let index = 0; index < 15; index++) {
    press(page, index)
    vi.advanceTimersByTime(100)
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
    // Synchronously, inside the dispatch, before any await.
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
    expect(page.listening()).toBe(7)
    vi.advanceTimersByTime(400)
    page.press('pointerdown')
    cleanup()
    expect(page.listening()).toBe(0)
    page.press('pointerdown')
    page.press('keydown')
    page.focus()
    page.blur()
    page.hide()
    page.show()
    page.restore(true)
    page.focus()
    vi.advanceTimersByTime(10 * allowDelayMs)
    expect(changes).toEqual([])
  })

  it('never arms while presses keep coming, and arms the delay after the last', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    pressFast(page)
    page.press('pointerdown')
    expect(changes).toEqual([])
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true])
  })

  it.each([
    ['a touch', 'pointerdown', { pointerType: 'touch' }],
    ['a pen', 'pointerdown', { pointerType: 'pen' }],
    ['a right button', 'pointerdown', { button: 2 }],
    ['a second pointer', 'pointerdown', { isPrimary: false }],
    ['Shift', 'keydown', { key: 'Shift' }],
    ['Tab', 'keydown', { key: 'Tab' }],
    ['a held Enter', 'keydown', { key: 'Enter', repeat: true }],
  ] as const)('waits again on any press, such as %s', (_, type, init) => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    pressFast(page, (p) => p.press(type, init))
    page.press(type, init)
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true])
  })

  it('hears presses in the capture phase, before a handler below can stop them', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    pressFast(page, (p, i) => p.press(i % 2 ? 'keydown' : 'pointerdown', {}, { captureOnly: true }))
    expect(changes).toEqual([])
    page.press('pointerdown', {}, { captureOnly: true })
    vi.advanceTimersByTime(allowDelayMs - 1)
    page.press('keydown', {}, { captureOnly: true })
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true])
  })

  it('stays armed through presses once armed, and takes each of them once', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    let armed = false
    armAfterFocus(page.doc, allowDelayMs, (value) => (changes.push(value), (armed = value)))
    vi.advanceTimersByTime(allowDelayMs)
    const gate = pressGate()
    page.press('pointerdown')
    gate.down(armed)
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)
    page.press('keydown', { key: 'Enter' })
    gate.down(armed, false)
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)
    vi.advanceTimersByTime(10 * allowDelayMs)
    expect(changes).toEqual([true])
  })

  it('disarms at once on a back-forward cache restore, and arms again after the delay', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(allowDelayMs)
    page.restore(false)
    vi.advanceTimersByTime(10 * allowDelayMs)
    expect(changes).toEqual([true])
    page.restore(true)
    expect(changes).toEqual([true, false])
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([true, false])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true, false, true])
  })

  it('restarts a wait already running on a restore', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(allowDelayMs - 1)
    page.restore(true)
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(allowDelayMs - 2)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true])
  })

  it('waits for the page to show when it is restored while still hidden', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(allowDelayMs)
    page.hide()
    page.shownHidden(true)
    vi.advanceTimersByTime(10 * allowDelayMs)
    expect(changes).toEqual([true, false])
    page.show()
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([true, false])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true, false, true])
  })

  it.each([true, false])('disarms at once when the page is left (pagehide, persisted %s), and arms after a restore', (persisted) => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(allowDelayMs)
    page.pagehide(persisted)
    expect(changes).toEqual([true, false])
    page.restore(true)
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([true, false])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true, false, true])
  })

  it('does not arm from presses or a restore while blurred or hidden, only the delay after it is back', () => {
    vi.useFakeTimers()
    const blurred = fakeDocument()
    const changes: boolean[] = []
    armAfterFocus(blurred.doc, allowDelayMs, (armed) => changes.push(armed))
    blurred.blur()
    pressFast(blurred)
    blurred.restore(true)
    vi.advanceTimersByTime(3 * allowDelayMs)
    expect(changes).toEqual([])
    blurred.focus()
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual([true])

    const hidden = fakeDocument()
    const hiddenChanges: boolean[] = []
    armAfterFocus(hidden.doc, allowDelayMs, (armed) => hiddenChanges.push(armed))
    hidden.hide()
    pressFast(hidden)
    vi.advanceTimersByTime(3 * allowDelayMs)
    expect(hiddenChanges).toEqual([])
    hidden.show()
    vi.advanceTimersByTime(allowDelayMs - 1)
    expect(hiddenChanges).toEqual([])
    vi.advanceTimersByTime(1)
    expect(hiddenChanges).toEqual([true])
  })

  it('keeps two guards on one document apart, as when an effect runs twice', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const first: boolean[] = []
    const second: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => first.push(armed))()
    const cleanupFirst = armAfterFocus(page.doc, allowDelayMs, (armed) => first.push(armed))
    armAfterFocus(page.doc, allowDelayMs, (armed) => second.push(armed))
    cleanupFirst()
    expect(page.listening()).toBe(7)
    pressFast(page)
    expect(second).toEqual([])
    vi.advanceTimersByTime(allowDelayMs)
    expect(second).toEqual([true])
    page.restore(true)
    vi.advanceTimersByTime(10 * allowDelayMs)
    expect(first).toEqual([])
  })

  it('never arms a document without a window, which cannot hear blur or a restore', () => {
    vi.useFakeTimers()
    const page = fakeDocument({ withWindow: false })
    const changes: boolean[] = []
    armAfterFocus(page.doc, allowDelayMs, (armed) => changes.push(armed))
    vi.advanceTimersByTime(10 * allowDelayMs)
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

  it('stops a held Enter that went down before arming and repeats once armed', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    let armed = false
    armAfterFocus(page.doc, allowDelayMs, (value) => (armed = value))
    const gate = pressGate()
    page.press('keydown', { key: 'Enter' })
    gate.down(armed, false)
    vi.advanceTimersByTime(allowDelayMs)
    expect(armed).toBe(true)
    page.press('keydown', { key: 'Enter', repeat: true })
    gate.down(armed, true)
    expect(gate.take()).toBe(false)
  })

  it('with the guard, takes a deliberate press once and none of a fast run of presses', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    let armed = false
    armAfterFocus(page.doc, allowDelayMs, (value) => (armed = value))
    const gate = pressGate()

    // Held across arming, then released.
    page.press('pointerdown')
    gate.down(armed)
    vi.advanceTimersByTime(allowDelayMs)
    expect(gate.take()).toBe(false)

    // A deliberate press once armed.
    page.press('pointerdown')
    gate.down(armed)
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)

    // A fast run of presses after a blur.
    page.blur()
    page.focus()
    pressFast(page, (p) => {
      p.press('pointerdown')
      gate.down(armed)
      expect(gate.take()).toBe(false)
    })
    expect(armed).toBe(false)
    vi.advanceTimersByTime(allowDelayMs - 100 - 1)
    expect(armed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(armed).toBe(true)
  })
  it('after a restore, takes none of a fast run of presses, then a deliberate press once the page is quiet', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    let armed = false
    armAfterFocus(page.doc, allowDelayMs, (value) => (armed = value))
    vi.advanceTimersByTime(allowDelayMs)
    expect(armed).toBe(true)
    const gate = pressGate()

    page.restore(true)
    expect(armed).toBe(false)
    pressFast(page, (p) => {
      p.press('pointerdown')
      gate.down(armed)
      expect(gate.take()).toBe(false)
    })
    expect(armed).toBe(false)
    vi.advanceTimersByTime(allowDelayMs - 100 - 1)
    expect(armed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(armed).toBe(true)

    page.press('pointerdown')
    gate.down(armed)
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)
  })

  it('takes no press made just before the guard arms, and waits a full delay again after it', () => {
    vi.useFakeTimers()
    const page = fakeDocument()
    let armed = false
    armAfterFocus(page.doc, allowDelayMs, (value) => (armed = value))
    const gate = pressGate()
    vi.advanceTimersByTime(allowDelayMs - 1)
    page.press('pointerdown')
    gate.down(armed)
    expect(gate.take()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(armed).toBe(false)
    vi.advanceTimersByTime(allowDelayMs - 2)
    expect(armed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(armed).toBe(true)
  })
})

describe('armedState', () => {
  // React stand-in: `set` is a default-priority update, rendered only by `render`; `flush` renders at once, as flushSync.
  const react = () => {
    const state = { rendered: false, pending: undefined as boolean | undefined }
    const render = () => {
      if (state.pending !== undefined) state.rendered = state.pending
      state.pending = undefined
    }
    const set = (value: boolean) => void (state.pending = value)
    const flush = (update: () => void) => {
      update()
      render()
    }
    return { state, render, set, flush }
  }

  it('does not flush arming', () => {
    const view = react()
    armedState(view.set, view.flush)(true)
    expect(view.state).toEqual({ rendered: false, pending: true })
  })

  it.each<[string, (page: Page) => void]>([
    ['hidden, left and restored', (page) => (page.hide(), page.pagehide(true), page.restore(true))],
    ['restored alone', (page) => page.restore(true)],
    ['left alone', (page) => page.pagehide(true)],
    ['blurred', (page) => page.blur()],
    ['hidden', (page) => page.hide()],
  ])('renders a disarm before the next press when %s', async (_, disarm) => {
    vi.useFakeTimers()
    const page = fakeDocument()
    const view = react()
    armAfterFocus(page.doc, allowDelayMs, armedState(view.set, view.flush))
    vi.advanceTimersByTime(allowDelayMs)
    view.render()
    expect(view.state.rendered).toBe(true)
    disarm(page)
    await Promise.resolve()
    const gate = pressGate()
    gate.down(view.state.rendered)
    expect(gate.take()).toBe(false)
  })
})
