import type { AppAddress } from './model'

const placeholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

const names = (text: string) => [...text.matchAll(placeholder)].map((match) => match[1]!)

// The parts of an address a `{field}` may stand in: the record key, the list's filter and order.
const templated = (to: AppAddress): string[] => {
  if (to.kind === 'record') return (Array.isArray(to.key) ? to.key : [to.key]).filter((part): part is string => typeof part === 'string')
  if (to.kind === 'list') return [to.filter, to.orderBy].filter((part): part is string => part !== undefined)
  return []
}

/** The fields whose values a link's address takes from the record, from its `{field}` placeholders. */
export const addressPlaceholders = (to: AppAddress) => [...new Set(templated(to).flatMap(names))]

/** The fields an href takes from the record, from its `{field}` placeholders. */
export const hrefPlaceholders = (href: string) => [...new Set(names(href))]

const fill = (text: string, record: Record<string, unknown>) =>
  text.replace(placeholder, (_, name: string) => (record[name] === null || record[name] === undefined ? '' : String(record[name])))

/** `to` with every `{field}` in its key, filter and order replaced by the record's value; a missing value becomes empty. */
export const fillAddress = (to: AppAddress, record: Record<string, unknown> = {}): AppAddress => {
  if (to.kind === 'record') {
    const part = (value: string | number) => (typeof value === 'string' ? fill(value, record) : value)
    return { ...to, key: Array.isArray(to.key) ? to.key.map(part) : part(to.key as string | number) }
  }
  if (to.kind !== 'list') return to
  return { ...to, ...(to.filter !== undefined && { filter: fill(to.filter, record) }), ...(to.orderBy !== undefined && { orderBy: fill(to.orderBy, record) }) }
}

/**
 * Whether an href leaves the app: it starts with a scheme (`https:`, `mailto:`) or `//`. A path inside the app is an
 * address, given as `to`, so that it is written one way everywhere.
 */
export const leavesApp = (href: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)

/** Why an href cannot be a link's `href`: it points inside the app, which takes an address in `to`. */
export const appHrefError = (href: string) =>
  leavesApp(href) ? undefined : `href "${href}" points inside the app; give the link \`to\` instead, an address such as { kind: 'record', resource: 'orders', key: '{order_id}' }`
