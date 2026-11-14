import { evaluateCondition, parseCondition } from '../condition'
import type { LayoutNode } from '../node'
import { blocks, escapeMarkdown } from './markdown'
import { recordValue } from './record-value'
import { childrenText, type TextContext, type TextForm } from './text-form'

// Text forms of the blocks that choose what is drawn, SolidJS's `Show` and `Switch`/`Match`: only the branch drawn
// reads. With a record its conditions are evaluated; without one nothing says whether they hold, so each reads as
// holding: a `Show` reads as its children, a `Switch` as its first `Match`.

const holds = (node: LayoutNode, record: Record<string, unknown> | undefined) => {
  if (!record) return true
  const when = String(node.props.when)
  const condition = parseCondition(when)
  if (!condition.ok) throw new Error(`<${node.type} when="${when}">: ${condition.message}`)
  const values = Object.fromEntries(condition.paths.map((path) => [path, recordValue(record, path)]))
  return evaluateCondition(condition, values)
}

// A fallback is text or elements; elements were rendered into the slot of the same name
const fallbackText = ({ node, slots }: TextContext) => (typeof node.props.fallback === 'string' ? escapeMarkdown(node.props.fallback) : blocks(slots.fallback ?? []))

const Show: TextForm = (context) => (holds(context.node, context.options.record) ? childrenText(context) : fallbackText(context))

// Its children are its `Match`es only, each one part of `children`, in order
const Switch: TextForm = (context) => {
  const matches = context.node.children.filter((child): child is LayoutNode => typeof child !== 'string')
  const drawn = matches.findIndex((match) => holds(match, context.options.record))
  return drawn === -1 ? fallbackText(context) : (context.children[drawn] ?? '')
}

export const conditionForms: Record<string, TextForm> = { Show, Switch }
