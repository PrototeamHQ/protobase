import { edgeCondition, edgeConditions, evaluateCondition, scopeValue, type GraphProps, type ShapeEdge } from '@protobase/layout'
import type { BadgeTone, ViewModel } from '@protobase/schema'
import { valueColor, valueTone } from '../../../../live/value-color'

/** How an edge draws: its line's colour, whether it moves, its dashes, and the text on its middle. */
export type EdgeLook = { stroke: string; animated: boolean; dash?: string; label?: string }

// A line in the colour its value's badge has, the app's border colour without one
const toneStrokes: Record<BadgeTone, string> = {
  neutral: 'var(--color-border-strong)',
  blue: 'var(--color-primary)',
  green: 'var(--color-success)',
  amber: 'var(--color-warning)',
  red: 'var(--color-danger)',
  violet: 'var(--color-violet)',
}

const dashes = { dashed: '6 4', dotted: '1.5 4' }

type Parsed = Partial<Record<(typeof edgeConditions)[number], ReturnType<typeof edgeCondition>>>

/** The graph's conditions on an edge, parsed once: a condition that does not parse never holds. */
export const edgeConditionsOf = (props: Pick<GraphProps, (typeof edgeConditions)[number]>): Parsed =>
  Object.fromEntries(edgeConditions.flatMap((name) => (typeof props[name] === 'string' ? [[name, edgeCondition(props[name])]] : [])))

const holds = (parsed: ReturnType<typeof edgeCondition> | undefined, row: Record<string, unknown>) => {
  if (!parsed?.ok) return false
  const scope = { stack: [{ record: row }] }
  return evaluateCondition(parsed, Object.fromEntries(parsed.paths.map((path) => [path, scopeValue(scope, path)])))
}

/** How `edge` draws by the graph's `edgeStatus`, `edgeLabel` and conditions, its colours and value labels the edges view's. */
export const edgeLook = (edge: ShapeEdge, props: Pick<GraphProps, 'edgeLabel' | 'edgeStatus'>, conditions: Parsed, view: ViewModel | undefined): EdgeLook => {
  const status = props.edgeStatus
  const colors = status === undefined ? undefined : view?.fields[status]?.valueColors
  const value = status === undefined ? undefined : edge.row[status]
  const stroke = status === undefined || value == null ? toneStrokes.neutral : (valueColor(colors, value) ?? toneStrokes[valueTone(colors, value)])
  const dash = holds(conditions.dotted, edge.row) ? dashes.dotted : holds(conditions.dashed, edge.row) ? dashes.dashed : undefined
  const labelValue = props.edgeLabel === undefined ? undefined : edge.row[props.edgeLabel]
  const labels = props.edgeLabel === undefined ? undefined : view?.fields[props.edgeLabel]?.valueLabels
  const label = labelValue == null || labelValue === '' ? undefined : (labels?.[String(labelValue)] ?? String(labelValue))
  return { stroke, animated: holds(conditions.animated, edge.row), ...(dash && { dash }), ...(label !== undefined && { label }) }
}
