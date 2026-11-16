// The recorders a typed layout is written with: `data.title` and `resources.tasks.count` are not values but records of
// what the layout reads, which turn into today's `{{title}}` placeholders and AIP-160 text when the layout is built.

const recorded = Symbol('recorded')

// A recorded path names the record it was read from by the child function that was given it, its scope, `0` for the
// layout's own data. Which `../` or `@root` reaches that record depends on the records around the place it ends up,
// which JSX builds inner elements first and so knows only once the whole tree is built: a path is written as a marker
// of its scope, `{{~3~title}}`, and a condition's field as `~~3~status~~`, which `resolveScopes` rewrites.

/** The scopes of the child functions running now, innermost last. */
const scopes: number[] = []
let lastScope = 0
/** How many layouts are being built now, inside which a record block's child function may run. */
let building = 0

/** Runs `build` as a typed layout builds, so its record blocks may take functions of their records. */
export const whileBuilding = <T>(build: () => T): T => {
  building += 1
  try {
    return build()
  } finally {
    building -= 1
  }
}

/** Runs `build` in a new scope, a record block's child function's, and gives the scope with what it built. */
export const inScope = <T>(build: (scope: number) => T): { scope: number; built: T } => {
  if (building === 0) throw new Error("A record block's children are a function of its record only inside a typed layout: layout(), recordLayout() or defineTemplate()")
  lastScope += 1
  const scope = lastScope
  scopes.push(scope)
  try {
    return { scope, built: build(scope) }
  } finally {
    scopes.pop()
  }
}

/** The elements whose children a child function built, by its scope. */
const scopeOf = new WeakMap<object, number>()

/** Notes that `node`'s children were built by the child function of `scope`. */
export const markScope = (node: object, scope: number) => {
  scopeOf.set(node, scope)
}

/** Gives `copy` the scope `node` was marked with, as an element held in a prop is copied into the tree. */
export const keepScope = (node: object, copy: object) => {
  const scope = scopeOf.get(node)
  if (scope !== undefined) scopeOf.set(copy, scope)
}

type PathInfo = { path: string[]; scope: number }

/** A filter value: written as it is in AIP-160 text. */
type Literal = string | number | boolean | null | Date

const durationPattern = /^\d+[smhdw]$/

/** A time relative to when the filter is read: `now()`, `now().plus('7d')`, `now().minus('1d')`. */
export class Now {
  constructor(readonly offset?: { sign: '+' | '-'; duration: string }) {}
  /** That long after now: `'7d'`, `'12h'`, `'30m'`, `'2w'`. */
  plus(duration: string) {
    return new Now({ sign: '+', duration: checkDuration(duration) })
  }
  /** That long before now. */
  minus(duration: string) {
    return new Now({ sign: '-', duration: checkDuration(duration) })
  }
  toString() {
    return this.offset ? `now() ${this.offset.sign} ${this.offset.duration}` : 'now()'
  }
}

const checkDuration = (duration: string) => {
  if (!durationPattern.test(duration)) throw new Error(`"${duration}" is not a duration: write a number and s, m, h, d or w, such as '7d'`)
  return duration
}

/** The time a filter is read, which `plus` and `minus` move: `f.next_run_at.lt(now().plus('7d'))`. */
export const now = () => new Now()

/** A condition: a filter of a block's records, or the `when` of a `Show`, written as AIP-160 text. */
export class Condition {
  /** @internal */
  constructor(
    /** @internal */
    readonly text: string,
    /** @internal */
    readonly op: 'and' | 'or' | 'term',
  ) {}
  /** Both hold: `a.and(b)`, written `a AND b`. */
  and(other: Condition) {
    return join('and', this, other)
  }
  /** Either holds: `a.or(b)`, written `a OR b`. */
  or(other: Condition) {
    return join('or', this, other)
  }
  toString() {
    return this.text
  }
}

// One AND or OR of two conditions, flattening a chain of the same operator and bracketing any other compound, as
// AIP-160 binds OR closer than AND, which a reader does not expect
const join = (op: 'and' | 'or', left: Condition, right: Condition) => {
  const side = (part: Condition) => (part.op === 'term' || part.op === op ? part.text : `(${part.text})`)
  return new Condition(`${side(left)} ${op.toUpperCase()} ${side(right)}`, op)
}

/** The condition does not hold: `not(f.archived.eq(true))`, written `NOT (archived = true)`. */
export const not = (condition: Condition) => new Condition(`NOT ${condition.op === 'term' ? condition.text : `(${condition.text})`}`, 'term')

/** Whether a value is a recorded path, such as `data.id`. */
export const isRecorded = (value: unknown): value is { [recorded]: PathInfo } => (typeof value === 'object' || typeof value === 'function') && value !== null && recorded in value

/** The `{{…}}` placeholder of a recorded path, marked with its scope until `resolveScopes` writes where it reads from. */
export const placeholder = (value: { [recorded]: PathInfo }) => `{{~${value[recorded].scope}~${value[recorded].path.join('.')}}}`

// A condition's field of a recorded record, marked with its scope as a placeholder is
const member = ({ path, scope }: PathInfo) => `~~${scope}~${path.join('.')}~~`

const valueMarker = /\{\{~(\d+)~([^{}~]*)\}\}/g
const memberMarker = /~~(\d+)~([^~]*)~~/g

// The path a marked one is where `frames` are the scopes of the records around it, outermost first: by its name in
// the nearest record, `@root` the layout's own data, `../` a record further out
const pathAt = (scope: number, path: string, frames: readonly (number | undefined)[]) => {
  const name = path === '' ? 'this' : path
  if (scope === 0) return frames.length === 0 ? name : path === '' ? '@root' : `@root.${path}`
  const at = frames.lastIndexOf(scope)
  if (at < 0) throw new Error(`"${name}" of a record is used outside the record block whose function gave it`)
  const up = frames.length - 1 - at
  return up === 0 ? name : `${'../'.repeat(up)}${name}`
}

// A condition names fields of the nearest record only
const memberAt = (scope: number, path: string, frames: readonly (number | undefined)[]) => {
  if ((scope === 0 && frames.length === 0) || (scope !== 0 && frames.at(-1) === scope)) return path
  throw new Error(`A condition compares "${path}" of a record further out than the nearest one around it, which a condition cannot name: compare it outside the inner record block, or in a filter`)
}

const resolveText = (text: string, frames: readonly (number | undefined)[]) =>
  text.includes('~') ? text.replace(valueMarker, (_, scope: string, path: string) => `{{${pathAt(Number(scope), path, frames)}}}`).replace(memberMarker, (_, scope: string, path: string) => memberAt(Number(scope), path, frames)) : text

type Node = { type: string; props: Record<string, unknown>; children: unknown[]; fallback?: unknown[]; custom?: boolean }

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as Node).type === 'string' && Array.isArray((value as Node).children)

/** How an element places what it holds: the scope its children and its element props draw in, given its own. */
export type ScopeStep<S> = (node: Node, scope: S) => { children: S; slots: S; depth: (scope: S) => number }

/**
 * The tree with every marked path written as it reads where it ends up, by the records around it: `step` gives the
 * scope an element's children and element props draw in, and how many records deep a scope is.
 */
export const resolveScopes = <T extends Node, S>(tree: T, start: S, step: ScopeStep<S>): T => {
  const visit = (node: Node, scope: S, frames: readonly (number | undefined)[]): Node => {
    const { children: inner, slots, depth } = step(node, scope)
    // A scope one record deeper than the element's own holds the record its child function gave, if it had one
    const framed = (next: S) => (depth(next) > depth(scope) ? [...frames, scopeOf.get(node)] : frames)
    const innerFrames = framed(inner)
    const slotFrames = framed(slots)
    const value = (item: unknown): unknown => {
      if (typeof item === 'string') return resolveText(item, frames)
      if (isNode(item)) return visit(item, slots, slotFrames)
      if (Array.isArray(item)) return item.map(value)
      if (typeof item === 'object' && item !== null) return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, value(entry)]))
      return item
    }
    const child = (at: S, atFrames: readonly (number | undefined)[]) => (entry: unknown) => (typeof entry === 'string' ? resolveText(entry, atFrames) : isNode(entry) ? visit(entry, at, atFrames) : entry)
    return {
      ...node,
      props: Object.fromEntries(Object.entries(node.props).map(([key, entry]) => [key, value(entry)])),
      children: node.children.map(child(inner, innerFrames)),
      ...(node.fallback && { fallback: node.fallback.map(child(scope, frames)) }),
    }
  }
  return visit(tree, start, []) as T
}

// A value in AIP-160: text quoted as JSON writes it, a recorded path as its placeholder, which the client fills as a
// literal, and a time relative to now as written
const valueText = (value: unknown): string => {
  if (isRecorded(value)) return placeholder(value)
  if (value instanceof Now) return value.toString()
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean' || value === null) return String(value)
  throw new Error(`${String(value)} cannot be a filter value: compare with text, a number, true or false, null, now() or a recorded field`)
}

const term = (text: string) => new Condition(text, 'term')

/** What a field or a recorded path can be compared with. */
const comparisons = (name: string) => ({
  eq: (value: unknown) => term(value === null ? `isNull(${name})` : `${name} = ${valueText(value)}`),
  ne: (value: unknown) => term(value === null ? `NOT isNull(${name})` : `${name} != ${valueText(value)}`),
  lt: (value: unknown) => term(`${name} < ${valueText(value)}`),
  le: (value: unknown) => term(`${name} <= ${valueText(value)}`),
  gt: (value: unknown) => term(`${name} > ${valueText(value)}`),
  ge: (value: unknown) => term(`${name} >= ${valueText(value)}`),
  in: (values: readonly unknown[]) => term(`in(${name}, ${values.map(valueText).join(', ')})`),
  contains: (value: unknown) => term(`${name}:${valueText(value)}`),
  isNull: () => term(`isNull(${name})`),
})

const comparisonNames = new Set(Object.keys(comparisons('')))

/**
 * A recorder of the values in scope: each property read is a path, `data.plan.name`, which is its `{{plan.name}}`
 * placeholder where it ends up as text, and compares like a field in a condition, `data.status.eq('done')`.
 */
export const recorder = (path: string[] = [], scope = scopes.at(-1) ?? 0): unknown =>
  new Proxy({}, {
    get: (_, key) => {
      if (key === recorded) return { path, scope }
      if (key === Symbol.toPrimitive || key === 'toString' || key === 'toJSON') return () => placeholder({ [recorded]: { path, scope } })
      if (typeof key === 'symbol') return undefined
      if (comparisonNames.has(key)) return comparisons(member({ path, scope }))[key as keyof ReturnType<typeof comparisons>]
      return recorder([...path, key], scope)
    },
    has: (_, key) => key === recorded,
  })

/** The fields of a resource as a filter's arrow is given them: `(f) => f.enabled.eq(true)`. A relation's field is `f.plan.name`. */
export const fieldRecorder = (path: string[] = []): unknown =>
  new Proxy(
    {},
    {
      get: (_, key) => {
        if (typeof key === 'symbol') return undefined
        if (comparisonNames.has(key) && path.length > 0) return comparisons(path.join('.'))[key as keyof ReturnType<typeof comparisons>]
        return fieldRecorder([...path, key])
      },
    },
  )

/** The page's tables, each counted where a condition reads it: `resources.loop_held.count.gt(0)`, written `loop_held.count > 0`. */
export const resourcesRecorder = (): unknown =>
  new Proxy(
    {},
    {
      get: (_, name) => (typeof name === 'symbol' ? undefined : { count: comparisons(`${name}.count`) }),
    },
  )
