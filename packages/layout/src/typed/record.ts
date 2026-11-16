// The recorders a typed layout is written with: `data.title` and `resources.tasks.count` are not values but records of
// what the layout reads, which turn into today's `{{title}}` placeholders and AIP-160 text when the layout is built.

const recorded = Symbol('recorded')

/** How deep in lists the layout being built is now: the page's record is at 0, a list's item one deeper. */
let depth = 0

/** Runs `build` one list deeper, as a list block calls its child function with its item. */
export const inList = <T>(build: () => T): T => {
  depth += 1
  try {
    return build()
  } finally {
    depth -= 1
  }
}

/** The list depth a child function's item is at, while it builds. */
export const currentDepth = () => depth

type PathInfo = { path: string[]; depth: number; root: boolean }

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

/**
 * The `{{…}}` placeholder of a recorded path where the layout is now: the item of the list it was read in by its
 * name, the page's record from inside a list as `@root`, and an outer list's item as `../`.
 */
export const placeholder = (value: { [recorded]: PathInfo }) => `{{${pathText(value[recorded])}}}`

const pathText = ({ path, depth: at, root }: PathInfo) => {
  const name = path.length === 0 ? 'this' : path.join('.')
  if (at === depth) return name
  if (root) return path.length === 0 ? '@root' : `@root.${path.join('.')}`
  return `${'../'.repeat(depth - at)}${name}`
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
export const recorder = (path: string[] = [], at = depth, root = at === 0): unknown =>
  new Proxy({}, {
    get: (_, key) => {
      if (key === recorded) return { path, depth: at, root }
      if (key === Symbol.toPrimitive || key === 'toString' || key === 'toJSON') return () => placeholder({ [recorded]: { path, depth: at, root } })
      if (typeof key === 'symbol') return undefined
      if (comparisonNames.has(key)) return comparisons(path.join('.'))[key as keyof ReturnType<typeof comparisons>]
      return recorder([...path, key], at, root)
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
