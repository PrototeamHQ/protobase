import { parseFilter, type FilterExpr } from '@protobase/schema'

// A planned filter is built as a syntax tree, which only parses once each `{{path}}` slot stands in for a value: a
// sentinel text no layout writes, or a sentinel duration after `+` or `-`, as in `now() - {{@params.window}}`. Printing
// the tree gives the sentinels back, where each is put back as the slot it stood for, in quotes only where the layout
// quoted it.

/** The slots of one page's planned filters, by sentinel, so nested filters keep theirs apart. */
export type Slots = { paths: Map<string, { path: string; quoted: boolean }>; next: number }

export const newSlots = (): Slots => ({ paths: new Map(), next: 0 })

const slotPattern = /(["'])\{\{\s*([^{}]*?)\s*\}\}\1|\{\{\s*([^{}]*?)\s*\}\}/g

/** A sentinel standing for `{{path}}`, in quotes or not; it parses as a text value either way, or as a duration. */
export const sentinel = (slots: Slots, path: string, quoted: boolean, duration = false) => {
  const index = slots.next++
  const name = duration ? `98765${index}0d` : `__pb_slot_${index}__`
  slots.paths.set(name, { path, quoted })
  return name
}

const afterSign = /[-+]\s*$/

/** The path a sentinel value stands for, if it is one. */
export const slotOf = (slots: Slots, value: unknown) => (typeof value === 'string' ? slots.paths.get(value)?.path : undefined)

/** `source` parsed with a sentinel for each slot; `undefined` for an empty filter. */
export const parseSlotted = (source: string | undefined, slots: Slots): FilterExpr | undefined => {
  if (source === undefined || source.trim() === '') return
  const text = source.replace(slotPattern, (_, quote: string | undefined, quotedPath: string | undefined, path: string | undefined, offset: number) =>
    quote === undefined ? sentinel(slots, path!, false, afterSign.test(source.slice(0, offset))) : `"${sentinel(slots, quotedPath!, true)}"`,
  )
  const parsed = parseFilter(text)
  // The page check refused a filter that does not parse before any plan is made
  if (!parsed.ok) throw new Error(`The filter "${source}" does not parse: ${parsed.errors[0]!.message}`)
  return parsed.ast
}

/** Printed filter text with each sentinel put back as its `{{path}}`. */
export const restoreSlots = (text: string, slots: Slots) =>
  // A sentinel inside a longer text value, such as a key `k-{{@params.x}}`, stands there alone
  text.replace(/"(__pb_slot_\d+__)"|(__pb_slot_\d+__)|\b(98765\d+0d)\b/g, (whole, quoted: string | undefined, inner: string | undefined, duration: string | undefined) => {
    const slot = slots.paths.get(quoted ?? inner ?? duration!)
    if (slot && inner) return `{{${slot.path}}}`
    if (!slot) return whole
    return slot.quoted ? `"{{${slot.path}}}"` : `{{${slot.path}}}`
  })
