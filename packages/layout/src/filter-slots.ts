import { parseFilter, type Expr } from 'aip-parsers/filter'

// A filter or condition with `{{path}}` slots only parses once each slot stands in for a value: a quoted one for a
// word, any other for a number. Each slot's place in that text then finds it in the syntax tree.

/** One `{{path}}` of a filter, where its stand-in starts, and whether it sits in quotes as a whole value. */
export type FilterSlot = { path: string; start: number; quoted: boolean }

const slotPattern = /(["'])\{\{\s*([^{}]*?)\s*\}\}\1|\{\{\s*([^{}]*?)\s*\}\}/g

/** `source` with every slot replaced by a stand-in value, and the slots in order. */
export const sampleSlots = (source: string): { text: string; slots: FilterSlot[] } => {
  const slots: FilterSlot[] = []
  let text = ''
  let last = 0
  for (const match of source.matchAll(slotPattern)) {
    text += source.slice(last, match.index)
    const quoted = match[1] !== undefined
    slots.push({ path: (quoted ? match[2] : match[3])!, start: text.length, quoted })
    text += quoted ? `${match[1]}x${match[1]}` : '0'
    last = match.index + match[0].length
  }
  return { text: text + source.slice(last), slots }
}

type Node = { kind: string; span?: { start: number }; [key: string]: unknown }

// The conjuncts of the top level: `a AND b c` is three.
const conjuncts = (expr: Expr): Expr[] => (expr.kind === 'and' || expr.kind === 'sequence' ? expr.args.flatMap(conjuncts) : [expr])

const isLiteralAt = (node: Node, start: number) => (node.kind === 'string' || node.kind === 'number') && node.span?.start === start

/**
 * The slots that are one side of a top-level AND equality with a field on the other, `field = {{path}}`, the one shape
 * a read can split per row without waiting for the rows it depends on; `undefined` when the filter does not parse.
 */
export const equalitySlots = (source: string): { slots: FilterSlot[]; split: Set<FilterSlot> } | undefined => {
  const { text, slots } = sampleSlots(source)
  const parsed = parseFilter(text)
  if (!parsed.ok) return
  const split = new Set<FilterSlot>()
  for (const conjunct of parsed.ast ? conjuncts(parsed.ast) : []) {
    if (conjunct.kind !== 'compare' || conjunct.op !== '=') continue
    const [left, right] = [conjunct.left as Node, conjunct.right as Node]
    for (const slot of slots) {
      if ((left.kind === 'member' && isLiteralAt(right, slot.start)) || (right.kind === 'member' && isLiteralAt(left, slot.start))) split.add(slot)
    }
  }
  return { slots, split }
}
