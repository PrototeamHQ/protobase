import type { ResourceModel } from '@protobase/schema'
import { embeddedFilterFields, templatePlaceholders, wholePlaceholder } from '@protobase/schema/internal'
import { equalitySlots } from './filter-slots'
import { defaultSource } from './list-blocks'
import type { LayoutChild, LayoutNode, LayoutValue } from './node'
import { resolveScopePath, type ScopeResolution } from './scope-lookup'
import { childScope, type Scope } from './walk'

// The `{{path}}` placeholders in an element's props, checked against the records around it. Reads start in parallel
// at page load, so a read may take a value from the records around it only where it can be split per row:
// `field = {{path}}` as a top-level AND condition, which a `related()` subquery carries. Anything else would wait for
// the parent's rows.

export type PathCheckInput = {
  models: Record<string, ResourceModel>
  /** The page parameters the page's `SelectInput`s declare. */
  params: ReadonlySet<string>
  /** Those of them whose `SelectInput` gives choices, the only ones a read may take: any other value is the address's text. */
  chosen: ReadonlySet<string>
}

export type PathFindings = { problems: string[]; warnings: string[] }

/** Props that shape a read, which are literals: a slot there would wait for the parent's rows. */
const shapeProps = ['resource', 'reference', 'target', 'source', 'sort', 'order', 'columns', 'perPage', 'limit', 'pagination', 'fields']

/** Props drawn as text, which read any path. */
const displayProps = ['title', 'description', 'empty', 'label', 'emptyText', 'content', 'valueLabelTrue', 'valueLabelFalse']

const waits = 'this would wait for the parent\'s rows'

const strings = (value: LayoutValue | undefined): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings)
  return []
}

type Resolved = Extract<ScopeResolution, { ok: true }>

// A slot a read can take as it is, known from the address before any read: a page parameter or the page record's key.
const isAddressValue = (resolved: Resolved, models: PathCheckInput['models']) =>
  (resolved.kind === 'data' && resolved.variable === 'params') ||
  (resolved.kind === 'field' && resolved.context.at === 'root' && resolved.names.length === 1 && Boolean(models[resolved.context.resource]?.primaryKey.includes(resolved.names[0]!)))

/** Problems and warnings of the placeholders in an element's props, where it sits in `scope`. */
export const pathFindings = (node: LayoutNode, scope: Scope, { models, params, chosen }: PathCheckInput): PathFindings => {
  const problems: string[] = []
  const warnings: string[] = []
  if (node.custom) return { problems, warnings }
  const resolve = (prop: string, path: string): Resolved | undefined => {
    const resolved = resolveScopePath(path, { models, scope, params, mode: 'stored' })
    if (!resolved.ok) {
      problems.push(`${prop}: ${resolved.message}`)
      return
    }
    if (resolved.kind === 'field' && resolved.shadows) warnings.push(`${prop}: ${resolved.shadows}`)
    return resolved
  }

  for (const prop of shapeProps) {
    if (strings(node.props[prop]).some((text) => templatePlaceholders(text).length > 0)) problems.push(`"${prop}" shapes the read and takes no {{…}}; ${waits}`)
  }
  // A slot inside a longer quoted value would be filled unescaped, so only one quoted alone is taken, as in a link's filter
  for (const prop of ['filter', 'edgeFilter', 'when', 'working']) {
    const value = node.props[prop]
    if (typeof value !== 'string') continue
    for (const path of embeddedFilterFields(value)) problems.push(`${prop}: "{{${path}}}" sits inside a longer quoted value; quote it alone, such as title = '{{${path}}}'`)
  }
  for (const prop of displayProps) {
    const value = node.props[prop]
    if (typeof value === 'string') for (const path of templatePlaceholders(value)) resolve(prop, path)
  }

  // A slot in a read's data: an address value anywhere, a field of a record around it only as the one per-row split
  // of each read, a Graph's edges being a read of their own
  const perRow = new Map<string, number>()
  const dataSlot = (prop: string, path: string, splits: boolean) => {
    const resolved = resolve(prop, path)
    if (resolved?.kind === 'data' && resolved.variable === 'params' && !chosen.has(resolved.names[0]!)) {
      return problems.push(`${prop}: "{{${path}}}" comes from a SelectInput without choices, so any text in the address would reach the read; give it choices`)
    }
    if (!resolved || isAddressValue(resolved, models)) return
    if (resolved.kind !== 'field' || resolved.names.length > 1) return problems.push(`${prop}: "{{${path}}}" is no stored field of a record, so a read cannot take it`)
    if (!splits) return problems.push(`${prop}: "{{${path}}}" sits where a read cannot split it per row; only field = {{${path}}} as a top-level AND condition can, and ${waits}`)
    const read = prop === 'edgeFilter' ? 'edges' : 'own'
    perRow.set(read, (perRow.get(read) ?? 0) + 1)
    if (perRow.get(read)! > 1) problems.push(`${prop}: "{{${path}}}" is a second per-row condition, and a read splits by one; ${waits}`)
  }
  // A reference block's `source` is the implicit equality `target = {{source}}`, or `id in {{source}}`
  if (['ReferenceManyField', 'ReferenceArrayField', 'ReferenceField'].includes(node.type)) dataSlot('source', typeof node.props.source === 'string' ? node.props.source : defaultSource, true)
  const filter = node.props.filter
  for (const prop of ['filter', 'edgeFilter']) {
    const value = node.props[prop]
    if (typeof value !== 'string') continue
    // A filter that does not parse is reported by the filter check
    const found = equalitySlots(value)
    for (const slot of found?.slots ?? []) dataSlot(prop, slot.path, found!.split.has(slot))
  }
  // A whole `{{path}}` in a key, a filter object or a value is the equality `field = {{path}}` itself
  const wholes = (prop: string, values: string[]) => {
    for (const text of values) {
      const whole = wholePlaceholder(text)
      for (const path of templatePlaceholders(text)) dataSlot(prop, path, whole !== undefined)
    }
  }
  if (typeof filter === 'object' && filter !== null && !Array.isArray(filter)) wholes('filter', strings(filter))
  if (typeof node.props.recordKey === 'string') wholes('recordKey', [node.props.recordKey])
  if (node.props.values !== undefined) wholes('values', strings(node.props.values))
  return { problems, warnings }
}

/**
 * Problems and warnings of the placeholders in an element's text children, which draw where its children do, and in
 * the text of its fallback, which draws in its place, each checked as a prop's text is: a path no record around it
 * has fails, rather than drawing as empty. A custom component's text is checked as a block's.
 */
export const textChildFindings = (node: LayoutNode, scope: Scope, { models, params }: Pick<PathCheckInput, 'models' | 'params'>): PathFindings => {
  const problems: string[] = []
  const warnings: string[] = []
  const check = (texts: readonly LayoutChild[], at: Scope, where: string) => {
    for (const text of texts) {
      if (typeof text !== 'string') continue
      for (const path of templatePlaceholders(text)) {
        const resolved = resolveScopePath(path, { models, scope: at, params, mode: 'stored' })
        if (!resolved.ok) problems.push(`${where} "{{${path}}}": ${resolved.message}`)
        else if (resolved.kind === 'field' && resolved.shadows) warnings.push(`${where} "{{${path}}}": ${resolved.shadows}`)
      }
    }
  }
  check(node.children, childScope(node, scope), 'text')
  check(node.fallback ?? [], scope, 'fallback text')
  return { problems, warnings }
}
