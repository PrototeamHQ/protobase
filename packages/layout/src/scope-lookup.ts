import { closest, distance } from 'fastest-levenshtein'
import type { ResourceModel } from '@protobase/schema'
import { parseTemplatePath } from '@protobase/schema/internal'
import { resolveFieldPath } from './field-path'
import type { Scope } from './walk'

// Resolves a layout path against the records around it at build time, by the Mustache spec's context-stack lookup
// (interpolation.yml, sections.yml) and Handlebars' path expressions (`../`, `this`, `@root`, `@index`). Where Mustache
// renders a name no context has as empty, this refuses it, so a layout it accepts renders the same under Mustache rules.

type Models = Record<string, ResourceModel>

/** A context the lookup searches: a record of the stack, by its place in it, or the page's own record. */
export type ScopeContext = { at: number | 'root'; resource: string }

type Context = ScopeContext & { label: string; item?: true }

/**
 * What a path names: a field of a record around it (`names` the whole path, the first a field of `context`), the whole
 * record (`this`), or a data variable the renderer supplies. `shadows` is set when a bare name is a field of more than
 * one context, saying which one it reads and how to reach the others.
 */
export type ScopeResolution =
  | { ok: true; kind: 'field'; context: ScopeContext; names: string[]; shadows?: string }
  | { ok: true; kind: 'record'; context: ScopeContext }
  | { ok: true; kind: 'data'; variable: 'params' | 'index' | 'first' | 'last'; names: string[] }
  /** An `ArrayField` item, or a key of one (`names`), which no model describes. */
  | { ok: true; kind: 'item'; names: string[] }
  | { ok: false; message: string }

/**
 * How the names after the first are read: `stored` from the stored value only, as a placeholder does (a JSON field's
 * keys), or `relations` through relations to the records they point at, as a condition does (`plan.name`).
 */
export type PathMode = 'stored' | 'relations'

export type LookupInput = {
  models: Models
  scope: Scope
  /** The page parameters a `SelectInput source` declares on the page, which `@params.<name>` reads. */
  params: ReadonlySet<string>
  mode: PathMode
}

// The contexts outermost first: the page's record at the bottom of the stack, as Mustache's root is.
const contextsOf = (scope: Scope): Context[] => [
  ...(scope.root === undefined ? [] : [{ at: 'root' as const, resource: scope.root, label: `${scope.root} (@root)` }]),
  // A record frame without a resource was refused by the structure check already; it still counts for `../`
  ...scope.stack.map((frame, at): Context => ({ at, resource: frame.resource ?? '', label: frame.item ? `the items of ${frame.block}` : (frame.resource ?? frame.block), ...(frame.item && { item: true as const }) })),
]

const hasField = (models: Models, resource: string, name: string) => Object.hasOwn(models[resource]?.fields ?? {}, name)

// What the names after the first may be: a stored placeholder reads only into a JSON value; a condition follows relations.
const restProblem = (models: Models, resource: string, names: string[], mode: PathMode): string | undefined => {
  if (names.length === 1) return
  if (mode === 'relations') {
    const resolved = resolveFieldPath(models, resource, names.join('.'))
    return resolved.ok ? undefined : resolved.message
  }
  const field = models[resource]!.fields[names[0]!]!
  if (field.type === 'json') return
  if (field.type === 'relation') return `"${names.join('.')}" goes through the relation ${names[0]}, but a placeholder reads the record's stored values; write ${names[0]} for its key`
  return `"${names.join('.')}" reads into ${names[0]}, a ${field.type} field of ${resource}, which holds no names`
}

// The ways to write `name` for a context other than the one it resolves to: `../` up to it, and `@root.` for the root.
const reachOf = (contexts: Context[], index: number, name: string) => {
  const up = contexts.length - 1 - index
  const parent = up > 0 ? [`${'../'.repeat(up)}${name}`] : []
  return contexts[index]!.at === 'root' ? [...parent, `@root.${name}`] : parent
}

const fieldNames = (models: Models, contexts: Context[]) => [...new Set(contexts.flatMap((context) => Object.keys(models[context.resource]?.fields ?? {})))]

// The field a typo most likely meant, when one is close enough to say so.
const suggestion = (name: string, names: string[]) => {
  if (names.length === 0) return ''
  const near = closest(name, names)
  return distance(name, near) <= Math.max(2, Math.floor(name.length / 3)) ? `; did you mean ${near}?` : ''
}

const outside = 'needs a record around it: put it inside a RecordCard, a CardRow or a RecordsIterator'

const dataVariable = (path: { variable: 'root' | 'params' | 'index' | 'first' | 'last'; names: string[] }, text: string, input: LookupInput): ScopeResolution => {
  const { scope, params, models, mode } = input
  if (path.variable === 'root') {
    if (scope.root === undefined) return { ok: false, message: `"${text}": @root is the page's own record, and this page has none` }
    const context = { at: 'root' as const, resource: scope.root }
    if (path.names.length === 0) return { ok: true, kind: 'record', context }
    if (!hasField(models, scope.root, path.names[0]!)) return { ok: false, message: `"${text}": "${path.names[0]}" is no field of ${scope.root} (@root)${suggestion(path.names[0]!, Object.keys(models[scope.root]?.fields ?? {}))}` }
    const rest = restProblem(models, scope.root, path.names, mode)
    return rest ? { ok: false, message: rest } : { ok: true, kind: 'field', context, names: path.names }
  }
  if (path.variable === 'params') {
    const [name, ...more] = path.names
    if (name === undefined || more.length > 0) return { ok: false, message: `"${text}": @params takes one parameter's name, such as @params.window` }
    return params.has(name) ? { ok: true, kind: 'data', variable: 'params', names: [name] } : { ok: false, message: `"${text}": no SelectInput source="${name}" on the page sets @params.${name}` }
  }
  if (!scope.stack.some((frame) => frame.repeated)) return { ok: false, message: `"${text}": @${path.variable} counts the rows of a CardRow or RecordsIterator, and this sits in none` }
  return { ok: true, kind: 'data', variable: path.variable, names: [] }
}

/** Resolves `text`, a path as a placeholder or `source` holds it, against the records around it. */
export const resolveScopePath = (text: string, input: LookupInput): ScopeResolution => {
  const path = parseTemplatePath(text)
  if (!path) return { ok: false, message: `"${text}" is no path; write a field's name, ../name, this.name, @root.name, @params.name, @index, @first or @last` }
  if (path.kind === 'data') return dataVariable(path, text, input)
  const { models, mode } = input
  const contexts = contextsOf(input.scope)
  if (contexts.length === 0) return { ok: false, message: `"${text}" ${outside}` }
  const [first] = path.names
  // `../` and `this` read one context, and no stack search: Handlebars' path expressions
  if (path.explicit) {
    const index = contexts.length - 1 - path.up
    if (index < 0) return { ok: false, message: `"${text}" goes up past the outermost record around it` }
    const context = contexts[index]!
    if (context.item) return { ok: true, kind: 'item', names: path.names }
    if (first === undefined) return { ok: true, kind: 'record', context: { at: context.at, resource: context.resource } }
    if (!hasField(models, context.resource, first)) return { ok: false, message: `"${text}": "${first}" is no field of ${context.label}${suggestion(first, Object.keys(models[context.resource]?.fields ?? {}))}` }
    const rest = restProblem(models, context.resource, path.names, mode)
    return rest ? { ok: false, message: rest } : { ok: true, kind: 'field', context: { at: context.at, resource: context.resource }, names: path.names }
  }
  // A bare name: the top context, then each lower one, then the root; the rest of a dotted name only from there. An
  // item has no model, so it may hold any name: one no record has is read from it
  const found = contexts.flatMap((context, index) => (!context.item && hasField(models, context.resource, first!) ? [index] : [])).reverse()
  const item = contexts.findLastIndex((context) => context.item)
  if (found.length === 0 && item >= 0) return { ok: true, kind: 'item', names: path.names }
  if (found.length === 0) {
    const searched = [...contexts].reverse().map((context) => context.label).join(', ')
    return { ok: false, message: `"${first}" is no field of ${searched}${suggestion(first!, fieldNames(models, contexts))}` }
  }
  const [nearest, ...others] = found
  const context = contexts[nearest!]!
  const rest = restProblem(models, context.resource, path.names, mode)
  if (rest) return { ok: false, message: rest }
  // An item nearer than the record may hold the name too, and Mustache would read it from there
  const nearerItem = item > nearest! ? [`write ${'../'.repeat(contexts.length - 1 - item)}this.${first} for an item's, if it has one`] : []
  const ways = [...nearerItem, ...others.map((index) => `write ${reachOf(contexts, index, first!).join(' or ')} for the one of ${contexts[index]!.label}`)]
  const shadows = ways.length === 0 ? undefined : `"${first}" resolves to ${context.label}; ${ways.join(', ')}`
  return { ok: true, kind: 'field', context: { at: context.at, resource: context.resource }, names: path.names, ...(shadows && { shadows }) }
}
