import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { longPressMs, nextPress, type Press, type PressEvent } from './message-press'

/** A message's own links and buttons, such as a mention, a file, a reaction or its thread's replies. */
const controls = 'a[href], button, input, textarea, select, [role="button"]'

/** A box the reader types in, which has the on-screen keyboard up while it has the focus. */
const textBoxes = 'input, textarea, [contenteditable]:not([contenteditable="false"])'

/**
 * Swallows the click a browser may send when the finger of a long-press lifts, which would land on what the long-press
 * opened, such as the backdrop of its sheet, and close it again. A new press or key comes before any later click, so
 * it stops there.
 */
const swallowReleaseClick = () => {
  const swallow = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    stop()
  }
  const stop = () => {
    window.removeEventListener('click', swallow, true)
    window.removeEventListener('pointerdown', stop, true)
    window.removeEventListener('keydown', stop, true)
  }
  window.addEventListener('click', swallow, true)
  window.addEventListener('pointerdown', stop, true)
  window.addEventListener('keydown', stop, true)
}

/**
 * The handlers that open a message's actions with a finger: a tap, or a long-press, which opens them while the finger
 * still rests, as `nextPress` decides; a tap while the reader types lowers the keyboard instead. The browser's own
 * long-press menu stays shut on a message pressed this way.
 */
export const useMessagePress = (onOpen: () => void) => {
  const press = useRef<Press>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** Whether the latest press was a finger's that may open the actions, which the browser's long-press menu leaves alone. */
  const pressing = useRef(false)
  const step = (event: PressEvent) => {
    const next = nextPress(press.current, event)
    press.current = next.press
    if (!next.press) clearTimeout(timer.current)
    return next.open
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  return {
    onPointerDown: (event: PointerEvent) => {
      clearTimeout(timer.current)
      const onControl = event.target instanceof Element && event.target.closest(controls) !== null
      const typing = document.activeElement instanceof Element && document.activeElement.matches(textBoxes)
      step({ type: 'down', x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', onControl, typing })
      pressing.current = press.current !== undefined
      if (!press.current) return
      timer.current = setTimeout(() => {
        if (!step({ type: 'held' })) return
        // A short tick where the device can, as a native long-press gives.
        navigator.vibrate?.(10)
        swallowReleaseClick()
        onOpen()
      }, longPressMs)
    },
    onPointerMove: (event: PointerEvent) => step({ type: 'move', x: event.clientX, y: event.clientY }),
    // A lifted finger is no long-press, even when the browser sends the tap's click later than `longPressMs`
    onPointerUp: () => {
      clearTimeout(timer.current)
      step({ type: 'up' })
    },
    onPointerCancel: () => step({ type: 'cancel' }),
    onClick: () => {
      const lowersKeyboard = press.current?.tapOpens === false
      if (step({ type: 'tap' })) onOpen()
      if (lowersKeyboard && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    },
    onContextMenu: (event: MouseEvent) => {
      if (pressing.current) event.preventDefault()
    },
  }
}
