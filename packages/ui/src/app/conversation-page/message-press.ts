/** How long a finger rests on a message before its actions open without letting go. */
export const longPressMs = 500

/** How far, in CSS pixels, a finger may drift before its press counts as a scroll rather than a tap or long-press. */
export const pressSlop = 10

/**
 * Where a finger came down on a message, while it may still become a tap or long-press. `tapOpens`: a tap opens the
 * actions too, unless it came while the reader was typing, when it only lowers the keyboard. `lifted`: the finger is
 * up, so only the tap's click may still come, however late the browser sends it.
 */
export type Press = { x: number; y: number; tapOpens: boolean; lifted?: true } | undefined

export type PressEvent =
  /**
   * `touch`: a finger rather than a mouse or pen. `onControl`: on a link or button of the message, which keeps its own
   * press. `typing`: a text box had the focus, so the on-screen keyboard is up.
   */
  | { type: 'down'; x: number; y: number; touch: boolean; onControl: boolean; typing: boolean }
  | { type: 'move'; x: number; y: number }
  /** The finger lifted. */
  | { type: 'up' }
  /** The browser took the touch over, such as to scroll. */
  | { type: 'cancel' }
  /** The finger stayed down for `longPressMs`. */
  | { type: 'held' }
  /** The browser's click after the finger lifted. */
  | { type: 'tap' }

/**
 * The next state of a press on a message, and whether it opens the message's actions: a finger that comes down on the
 * message, off its links and buttons, and lifts or rests there without drifting away; a tap while the reader types
 * only lowers the keyboard. A mouse keeps the hover bar.
 */
export const nextPress = (press: Press, event: PressEvent): { press: Press; open: boolean } => {
  if (event.type === 'down') {
    return { press: event.touch && !event.onControl ? { x: event.x, y: event.y, tapOpens: !event.typing } : undefined, open: false }
  }
  if (event.type === 'cancel') return { press: undefined, open: false }
  if (event.type === 'up') return { press: press && { ...press, lifted: true }, open: false }
  if (event.type === 'move') {
    if (!press) return { press, open: false }
    const drifted = Math.hypot(event.x - press.x, event.y - press.y) > pressSlop
    return { press: drifted ? undefined : press, open: false }
  }
  if (event.type === 'tap') return { press: undefined, open: press?.tapOpens === true }
  if (press?.lifted) return { press, open: false }
  return { press: undefined, open: press !== undefined }
}
