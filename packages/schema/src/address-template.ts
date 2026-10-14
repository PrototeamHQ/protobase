import type { AppAddress } from './model'

const placeholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

const names = (text: string) => [...text.matchAll(placeholder)].map((match) => match[1]!)

// The parts of an address a `{field}` may stand in: the record key, the list's filter and order, a create form's values.
const templated = (to: AppAddress): string[] => {
  if (to.kind === 'record') return (Array.isArray(to.key) ? to.key : [to.key]).filter((part): part is string => typeof part === 'string')
  if (to.kind === 'list') return [to.filter, to.orderBy].filter((part): part is string => part !== undefined)
  if (to.kind === 'create') return Object.values(to.values ?? {})
  return []
}

/** The fields whose values a link's address takes from the record, from its `{field}` placeholders. */
export const addressPlaceholders = (to: AppAddress) => [...new Set(templated(to).flatMap(names))]

/** The fields an href takes from the record, from its `{field}` placeholders. */
export const hrefPlaceholders = (href: string) => [...new Set(names(href))]

const fill = (text: string, record: Record<string, unknown>) =>
  text.replace(placeholder, (_, name: string) => (record[name] === null || record[name] === undefined ? '' : String(record[name])))

/** `to` with every `{field}` in its key, filter, order or values replaced by the record's value; a missing value becomes empty. */
export const fillAddress = (to: AppAddress, record: Record<string, unknown> = {}): AppAddress => {
  if (to.kind === 'record') {
    const part = (value: string | number) => (typeof value === 'string' ? fill(value, record) : value)
    return { ...to, key: Array.isArray(to.key) ? to.key.map(part) : part(to.key as string | number) }
  }
  if (to.kind === 'create') return to.values ? { ...to, values: Object.fromEntries(Object.entries(to.values).map(([name, value]) => [name, fill(value, record)])) } : to
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

/** The field an action's href is made of alone, `{field}`: the record's value is the whole URL, as it is stored. */
export const hrefField = (href: string) => /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(href)?.[1]

/**
 * Why a link action cannot be built: an `href` that points inside the app (one that is a single `{field}`, the URL the
 * record holds, is fine), or `{host}` in the label of a link that goes `to` an address in the app, which has no host.
 */
export const linkActionError = (label: string, run: { to: AppAddress } | { href: string }) => {
  if ('href' in run) return hrefField(run.href) ? undefined : appHrefError(run.href)
  return label.includes('{host}') ? 'the label names {host}, which only a link with an href has' : undefined
}
