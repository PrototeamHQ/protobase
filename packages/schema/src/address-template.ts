import type { AppAddress } from './model'
import { fillPlaceholders, recordValueAt, templatePlaceholders, wholePlaceholder } from './template-path'

/** How a filler reads the value at a path, such as `recordValueAt` on one record, or a layout's stack of records. */
export type PathLookup = (path: string) => unknown

const names = templatePlaceholders

/** The path a link's address takes its resource from, when its `resource` is only `{{path}}`, as `'{{name}}'`. */
export const resourceField = (to: AppAddress) => (to.kind === 'page' ? undefined : wholePlaceholder(to.resource))

// The parts of an address a `{{path}}` may stand in: the resource, the record key, tab, run and panel, the list's filter and order, a create form's values.
const templated = (to: AppAddress): string[] => {
  if (to.kind === 'page') return []
  const resource = resourceField(to) === undefined ? [] : [to.resource]
  if (to.kind === 'record') return [...resource, ...(Array.isArray(to.key) ? to.key : [to.key]).filter((part): part is string => typeof part === 'string'), ...[to.tab, to.run, to.panel].filter((part) => part !== undefined)]
  if (to.kind === 'list') return [...resource, ...[to.filter, to.orderBy].filter((part): part is string => part !== undefined)]
  return [...resource, ...Object.values(to.values ?? {})]
}

/** The paths whose values a link's address takes from the record, from its `{{path}}` placeholders. */
export const addressPlaceholders = (to: AppAddress) => [...new Set(templated(to).flatMap(names))]

/** The paths a text, such as an href or a label, takes from the record, from its `{{path}}` placeholders. */
export const textPlaceholders = (text: string) => [...new Set(names(text))]

/** The paths an href takes from the record, from its `{{path}}` placeholders. */
export const hrefPlaceholders = textPlaceholders

/** `text` with every `{{path}}` replaced by `value(path)`, such as a button's label by the row's values as shown. */
export const fillText = fillPlaceholders

/** A value as a placeholder writes it: a missing one empty. */
export const valueText = (value: unknown) => (value === null || value === undefined ? '' : String(value))

const fill = (text: string, lookup: PathLookup) => fillText(text, (path) => valueText(lookup(path)))

const filterPlaceholder = /(["'])\{\{\s*([^{}]*?)\s*\}\}\1|\{\{\s*([^{}]*?)\s*\}\}/g

/**
 * `filter` with every `{{path}}` replaced by its value. A quoted `'{{path}}'` takes the value as a string, its
 * backslashes and quotes escaped, so any text stays one value; Handlebars escapes for HTML instead, where this lands in
 * a filter or condition.
 */
export const fillFilter = (filter: string, lookup: PathLookup) =>
  filter.replace(filterPlaceholder, (_, quote: string | undefined, quoted: string | undefined, bare: string | undefined) =>
    quote ? `${quote}${valueText(lookup(quoted!)).replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`)}${quote}` : valueText(lookup(bare!)),
  )

/**
 * `to` with every `{{path}}` in its resource, key, tab, run, panel, filter, order or values replaced by the value
 * `lookup` gives; a missing value becomes empty, and one quoted in a filter is escaped.
 */
export const fillAddressFrom = (to: AppAddress, lookup: PathLookup): AppAddress => {
  if (to.kind === 'page') return to
  const resource = resourceField(to) === undefined ? to.resource : fill(to.resource, lookup)
  if (to.kind === 'record') {
    const part = (value: string | number) => (typeof value === 'string' ? fill(value, lookup) : value)
    return { ...to, resource, key: Array.isArray(to.key) ? to.key.map(part) : part(to.key as string | number), ...(to.tab !== undefined && { tab: fill(to.tab, lookup) }), ...(to.run !== undefined && { run: fill(to.run, lookup) }), ...(to.panel !== undefined && { panel: fill(to.panel, lookup) }) }
  }
  if (to.kind === 'create') return { ...to, resource, ...(to.values && { values: Object.fromEntries(Object.entries(to.values).map(([name, value]) => [name, fill(value, lookup)])) }) }
  return { ...to, resource, ...(to.filter !== undefined && { filter: fillFilter(to.filter, lookup) }), ...(to.orderBy !== undefined && { orderBy: fill(to.orderBy, lookup) }) }
}

/** `to` with every `{{path}}` replaced by the record's value at that path. */
export const fillAddress = (to: AppAddress, record: Record<string, unknown> = {}): AppAddress => fillAddressFrom(to, (path) => recordValueAt(record, path))

/** The paths a list address's filter takes outside quotes, whose values go into the filter as they are, such as `{{task_id}}` in `task_id = {{task_id}}`. */
export const bareFilterFields = (to: AppAddress) =>
  to.kind === 'list' && to.filter !== undefined ? [...new Set([...to.filter.matchAll(filterPlaceholder)].flatMap((match) => (match[3] === undefined ? [] : [match[3]])))] : []

const quotedLiteral = /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/g

const wholeQuoted = /^(["'])\{\{\s*[^{}]*?\s*\}\}\1$/

/**
 * The paths a filter takes inside a longer quoted value, such as `{{name}}` in `title = 'abc{{name}}'`; only a quoted
 * value that is the placeholder alone is escaped when filled, so these are refused.
 */
export const embeddedFilterFields = (filter: string) => [...new Set([...filter.matchAll(quotedLiteral)].flatMap(([literal]) => (wholeQuoted.test(literal) ? [] : names(literal))))]

/**
 * Whether an href leaves the app: it starts with a scheme (`https:`, `mailto:`) or `//`. A path inside the app is an
 * address, given as `to`, so that it is written one way everywhere.
 */
export const leavesApp = (href: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)

/** Why an href cannot be a link's `href`: it points inside the app, which takes an address in `to`. */
export const appHrefError = (href: string) =>
  leavesApp(href) ? undefined : `href "${href}" points inside the app; give the link \`to\` instead, an address such as { kind: 'record', resource: 'orders', key: '{{order_id}}' }`

/** The path an action's href is made of alone, `{{field}}`: the record's value is the whole URL, as it is stored. */
export const hrefField = wholePlaceholder

/** What a link action's label writes for the host its target opens. */
export const hostPlaceholder = '{{host}}'

/**
 * Why a link action cannot be built: an `href` that points inside the app (one that is a single `{{field}}`, the URL the
 * record holds, is fine), or `{{host}}` in the label of a link that goes `to` an address in the app, which has no host.
 */
export const linkActionError = (label: string, run: { to: AppAddress } | { href: string }) => {
  if ('href' in run) return hrefField(run.href) ? undefined : appHrefError(run.href)
  return label.includes(hostPlaceholder) ? `the label names ${hostPlaceholder}, which only a link with an href has` : undefined
}
