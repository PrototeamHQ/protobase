import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { startScreenHandOff, startScreenId } from './start-screen'

// index.html watches for a start that fails until the app hands off (start-screen.ts); it runs here on stand-ins for
// the window, the start screen and the timers
const html = readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8')
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!).find((script) => script.includes(startScreenHandOff))

type Listener = (event?: { type: string; target?: unknown }) => void

const listeners = () => {
  const added = new Map<string, Listener>()
  return {
    added,
    addEventListener: (type: string, listener: Listener) => added.set(type, listener),
    removeEventListener: (type: string, listener: Listener) => added.get(type) === listener && added.delete(type),
  }
}

const watch = () => {
  const window = listeners()
  const svg = { removed: false, remove: () => (svg.removed = true) }
  const alert = { hidden: true }
  const start = { ...listeners(), ariaHidden: true, removeAttribute: () => (start.ariaHidden = false), querySelector: (selector: string) => (selector === 'svg' ? svg : alert) }
  const snapshot = { removed: false, remove: () => (snapshot.removed = true) }
  const document = { getElementById: (id: string) => (id === startScreenId ? start : id === 'pb-snapshot' ? snapshot : null) }
  const timers = new Map<number, () => void>()
  const setTimeout = (callback: () => void) => timers.set(timers.size + 1, callback).size
  const clearTimeout = (id: number) => timers.delete(id)
  new Function('window', 'document', 'setTimeout', 'clearTimeout', code!)(window, document, setTimeout, clearTimeout)
  const failedShown = () => alert.hidden === false && svg.removed && !start.ariaHidden
  return { window, start, timers, snapshot, failedShown, fire: (type: string, target?: unknown) => window.added.get(type)?.({ type, target }) }
}

describe("index.html's watch for a failed start", () => {
  it('ends at the hand-off, taking its listeners and its watchdog with it', () => {
    const { window, start, timers, failedShown } = watch()
    expect([...window.added.keys()]).toEqual(['error', 'unhandledrejection'])
    expect(timers.size).toBe(1)
    start.added.get(startScreenHandOff)!()
    expect(window.added.size).toBe(0)
    expect(start.added.size).toBe(0)
    expect(timers.size).toBe(0)
    expect(failedShown()).toBe(false)
  })

  it("says so when the app's script does not load", () => {
    const { window, timers, fire, failedShown } = watch()
    fire('error', { tagName: 'SCRIPT' })
    expect(failedShown()).toBe(true)
    expect(window.added.size).toBe(0)
    expect(timers.size).toBe(0)
  })

  it("takes a host's snapshot away to say so", () => {
    const { window, fire, snapshot, failedShown } = watch()
    fire('error', window)
    expect(failedShown()).toBe(true)
    expect(snapshot.removed).toBe(true)
  })

  it('says so when the app throws before its first page', () => {
    const { window, fire, failedShown } = watch()
    fire('error', window)
    expect(failedShown()).toBe(true)
  })

  it('says so when a promise of the app fails unhandled', () => {
    const { fire, failedShown } = watch()
    fire('unhandledrejection')
    expect(failedShown()).toBe(true)
  })

  it('says so when the first page has not come by the watchdog', () => {
    const { timers, failedShown } = watch()
    timers.get(1)!()
    expect(failedShown()).toBe(true)
  })

  it('waits on when only a stylesheet does not load', () => {
    const { window, fire, failedShown } = watch()
    fire('error', { tagName: 'LINK' })
    expect(failedShown()).toBe(false)
    expect(window.added.size).toBe(2)
  })
})
