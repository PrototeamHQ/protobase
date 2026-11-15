import type { InputPin, OutputPin } from './node-pins'

/** A node's header, holding its type and name with the execution handles beside it, and each pin's row. */
export const headerHeight = 52
export const rowHeight = 26
const foldHeight = 24
const padding = 8

/** The width of a step's or the trigger's node, and of a Break's or a Make's. */
export const stepWidth = 296
export const pureWidth = 216

/**
 * The inputs a node shows: the ones its type needs and the ones that hold something, all of them once it is opened,
 * so a node stays small; with how many it folds away.
 */
export const shownInputs = (inputs: readonly InputPin[], open: boolean): { shown: InputPin[]; folded: number } => {
  const shown = open ? [...inputs] : inputs.filter((pin) => pin.required || pin.state !== 'empty')
  return { shown, folded: inputs.length - shown.length }
}

/** A node's height: its header, then a row per pin on the side with more, and the row that folds its optional inputs. */
export const pinnedHeight = (inputs: number, outputs: readonly OutputPin[] | number, foldable: boolean, header = headerHeight) => {
  const rows = Math.max(inputs, typeof outputs === 'number' ? outputs : outputs.length)
  return header + rows * rowHeight + (foldable ? foldHeight : 0) + padding
}
