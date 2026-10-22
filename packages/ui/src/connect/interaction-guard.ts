import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** How long the connect page must have been in front, visible and focused, before Allow takes a click. */
export const allowDelayMs = 500

/** Whether the page runs inside another page's frame; comparing the two windows works across origins and in a sandbox. */
export const isFramed = (win: { top: unknown; self: unknown } = window) => win.top !== win.self

type Listening = {
  addEventListener: (type: string, listener: (event: Event) => void, capture?: boolean) => void
  removeEventListener: (type: string, listener: (event: Event) => void, capture?: boolean) => void
}

/** The part of `document` the guard reads: whether the page shows and has focus, its presses, and its window's focus and page events. */
export type GuardDocument = Listening & { visibilityState: string; hasFocus: () => boolean; defaultView: Listening | null }

/**
 * Calls `onChange(true)` once the document has been visible and focused for `delayMs` without a break, and
 * `onChange(false)` as soon as the window loses focus, the document is hidden or the page is left (`pagehide`), waiting
 * again from the next focus. A click aimed at another page, such as the second half of a double-click on a page that
 * just gave way to this one, lands before then. While unarmed, a press anywhere on the page (`pointerdown` or `keydown`,
 * of any pointer, button or key) or a restore from the back-forward cache starts the wait again, so pressing as fast as
 * one can over the spot never lands an armed press. `pointerdown` is the only pointer event that still reaches the
 * document from a disabled button. A document without a window never arms, since it cannot hear blur or a restore.
 * Returns the cleanup that removes its listeners and timer.
 */
export const armAfterFocus = (doc: GuardDocument, delayMs: number, onChange: (armed: boolean) => void) => {
  let armed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const set = (value: boolean) => {
    if (armed === value) return
    armed = value
    onChange(value)
  }
  const disarm = () => {
    clearTimeout(timer)
    set(false)
  }
  const wait = () => {
    disarm()
    if (doc.defaultView && doc.visibilityState === 'visible' && doc.hasFocus()) timer = setTimeout(() => set(true), delayMs)
  }
  const visibility = () => (doc.visibilityState === 'visible' ? wait() : disarm())
  const pressed = () => {
    if (!armed) wait()
  }
  const shown = (event: Event) => {
    if ('persisted' in event && event.persisted) wait()
  }
  doc.defaultView?.addEventListener('focus', wait)
  doc.defaultView?.addEventListener('blur', disarm)
  doc.defaultView?.addEventListener('pagehide', disarm)
  doc.defaultView?.addEventListener('pageshow', shown)
  doc.addEventListener('visibilitychange', visibility)
  doc.addEventListener('pointerdown', pressed, true)
  doc.addEventListener('keydown', pressed, true)
  wait()
  return () => {
    clearTimeout(timer)
    doc.defaultView?.removeEventListener('focus', wait)
    doc.defaultView?.removeEventListener('blur', disarm)
    doc.defaultView?.removeEventListener('pagehide', disarm)
    doc.defaultView?.removeEventListener('pageshow', shown)
    doc.removeEventListener('visibilitychange', visibility)
    doc.removeEventListener('pointerdown', pressed, true)
    doc.removeEventListener('keydown', pressed, true)
  }
}

/**
 * Whether a click on a guarded button goes through: only one whose press began on it while it was armed (`down`), and
 * not a key held down and repeating. A mouse button held across the moment it arms, or Enter held from before, does
 * not count.
 */
export const pressGate = () => {
  let began = false
  return {
    /** The press began: on `pointerdown` or `keydown`, with whether the button was armed then and the key repeats. */
    down: (armed: boolean, repeat = false) => {
      began = armed && !repeat
    },
    /** The click: true once for a press that began armed. */
    take: () => {
      const counts = began
      began = false
      return counts
    },
  }
}

/** `armAfterFocus`'s onChange as React state: a disarm renders at once (`flush`), so the very next press sees it. */
export const armedState = (set: (armed: boolean) => void, flush: (update: () => void) => void) => (armed: boolean) =>
  armed ? set(true) : flush(() => set(false))

/**
 * Whether the page has been in front for `delayMs` (`armAfterFocus`), as React state: it waits again after a press while
 * unarmed and after a back-forward cache restore, and a disarm renders synchronously, so the next press already sees it.
 */
export const useArmedAfterFocus = (delayMs: number) => {
  const [armed, setArmed] = useState(false)
  useEffect(() => armAfterFocus(document, delayMs, armedState(setArmed, flushSync)), [delayMs])
  return armed
}

/**
 * The handlers of a button guarded by `armed`: its press must begin while armed for its click to act (`pressGate`).
 * With `armed` from `useArmedAfterFocus`, it is never stale after a disarm, which renders synchronously.
 */
export const useGuardedPress = (armed: boolean, onPress: () => void) => {
  const gate = useRef(pressGate())
  return {
    onPointerDown: () => gate.current.down(armed),
    onKeyDown: (event: { repeat: boolean }) => gate.current.down(armed, event.repeat),
    onClick: () => {
      if (gate.current.take()) onPress()
    },
  }
}
