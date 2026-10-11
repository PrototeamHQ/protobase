import { fieldRefsIn } from './field-ref'

/**
 * Where a part of a model names fields, and what a field the caller cannot read does to it. A shape declares every part
 * of the model it walks: a part it does not declare is left out, so a new part cannot reach a caller unchecked.
 */
export type RefShape =
  /** Plain data that names no field: kept as it is. */
  | { kind: 'data' }
  /** A field's name: left out when hidden. */
  | { kind: 'field' }
  /** Free-form data, such as a custom component's props, with field references (`{ $field }`) anywhere: left out when one is hidden. */
  | { kind: 'refs' }
  /** An object keyed by field names, such as field hints: hidden keys are left out, or with `all` the whole object. */
  | { kind: 'keys'; all: boolean }
  /** A list: entries left out are dropped, and with `nonEmpty` a list left empty is left out too. */
  | { kind: 'list'; of: RefShape; nonEmpty: boolean }
  /** A fixed list, such as `[field, direction]`: left out when any entry is. */
  | { kind: 'tuple'; items: RefShape[] }
  /** An object: a part left out is dropped, a `requires` part left out leaves out the object; `after` tidies the result. */
  | { kind: 'object'; props: Record<string, RefShape>; requires: string[]; after?: (value: never) => unknown }
  /** One shape per value of `kind`, as layout items and displays are told apart; an unknown kind is left out. */
  | { kind: 'oneOf'; cases: Record<string, RefShape> }
  /** A part pruned by code, such as one naming another resource's fields: `prune` returns it narrowed, or `undefined`. */
  | { kind: 'map'; prune: (value: never) => unknown }

/** One shape per property of `T`, so the compiler names a property the shape forgets. */
export type PropShapes<T> = { [K in keyof T]-?: RefShape }

/** The shapes, typed against the model they describe. */
export const shapes = {
  data: { kind: 'data' } as RefShape,
  field: { kind: 'field' } as RefShape,
  refs: { kind: 'refs' } as RefShape,
  keys: (o: { all?: boolean } = {}): RefShape => ({ kind: 'keys', all: o.all ?? false }),
  list: (of: RefShape, o: { nonEmpty?: boolean } = {}): RefShape => ({ kind: 'list', of, nonEmpty: o.nonEmpty ?? false }),
  tuple: (...items: RefShape[]): RefShape => ({ kind: 'tuple', items }),
  object: <T extends object>(props: PropShapes<T>, o: { requires?: Array<keyof T & string>; after?: (value: T) => T } = {}): RefShape => ({
    kind: 'object',
    props,
    requires: o.requires ?? [],
    ...(o.after && { after: o.after }),
  }),
  oneOf: <T extends { kind: string }>(cases: { [K in T['kind']]: RefShape }): RefShape => ({ kind: 'oneOf', cases }),
  map: <T>(prune: (value: T) => T | undefined): RefShape => ({ kind: 'map', prune }),
}

const gone = Symbol('gone')

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const walk = (value: unknown, shape: RefShape, visible: (name: string) => boolean): unknown => {
  switch (shape.kind) {
    case 'data':
      return value
    case 'field':
      return typeof value === 'string' && visible(value) ? value : gone
    case 'refs':
      return fieldRefsIn(value).every(visible) ? value : gone
    case 'keys': {
      if (!isObject(value)) return gone
      const entries = Object.entries(value)
      const kept = entries.filter(([name]) => visible(name))
      return shape.all && kept.length < entries.length ? gone : Object.fromEntries(kept)
    }
    case 'list': {
      if (!Array.isArray(value)) return gone
      const kept = value.map((entry) => walk(entry, shape.of, visible)).filter((entry) => entry !== gone)
      return shape.nonEmpty && kept.length === 0 ? gone : kept
    }
    case 'tuple': {
      if (!Array.isArray(value) || value.length !== shape.items.length) return gone
      const items = value.map((entry, index) => walk(entry, shape.items[index]!, visible))
      return items.includes(gone) ? gone : items
    }
    case 'object': {
      if (!isObject(value)) return gone
      const kept: Record<string, unknown> = {}
      for (const [name, entry] of Object.entries(value)) {
        const part = Object.hasOwn(shape.props, name) ? shape.props[name] : undefined
        if (!part || entry === undefined) continue
        const pruned = walk(entry, part, visible)
        if (pruned === gone && shape.requires.includes(name)) return gone
        if (pruned !== gone) kept[name] = pruned
      }
      return shape.after ? shape.after(kept as never) : kept
    }
    case 'oneOf': {
      const kind = isObject(value) && typeof value.kind === 'string' ? value.kind : undefined
      const shaped = kind !== undefined && Object.hasOwn(shape.cases, kind) ? shape.cases[kind] : undefined
      return shaped ? walk(value, shaped, visible) : gone
    }
    case 'map':
      return shape.prune(value as never) ?? gone
  }
}

/**
 * `value` with every part naming a field `visible` refuses left out, as `shape` says, or `undefined` when the whole
 * value goes. One walker for every model the app sends: views, custom component props and composed pages' custom nodes.
 */
export const pruneByShape = <T>(value: T, shape: RefShape, visible: (name: string) => boolean): T | undefined => {
  const pruned = walk(value, shape, visible)
  return pruned === gone ? undefined : (pruned as T)
}
