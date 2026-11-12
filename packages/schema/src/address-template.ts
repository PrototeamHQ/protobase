import type { AppAddress } from './model'

const placeholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

const names = (text: string) => [...text.matchAll(placeholder)].map((match) => match[1]!)

/** The field a link's address takes its resource from, when its `resource` is only `{field}`, as `'{name}'`. */
export const resourceField = (to: AppAddress) => (to.kind === 'page' ? undefined : /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(to.resource)?.[1])

// The parts of an address a `{field}` may stand in: the resource, the record key, tab, run and panel, the list's filter and order, a create form's values.
const templated = (to: AppAddress): string[] => {
  if (to.kind === 'page') return []
  const resource = resourceField(to) === undefined ? [] : [to.resource]
  if (to.kind === 'record') return [...resource, ...(Array.isArray(to.key) ? to.key : [to.key]).filter((part): part is string => typeof part === 'string'), ...[to.tab, to.run, to.panel].filter((part) => part !== undefined)]
  if (to.kind === 'list') return [...resource, ...[to.filter, to.orderBy].filter((part): part is string => part !== undefined)]
  return [...resource, ...Object.values(to.values ?? {})]
}

/** The fields whose values a link's address takes from the record, from its `{field}` placeholders. */
export const addressPlaceholders = (to: AppAddress) => [...new Set(templated(to).flatMap(names))]

/** The fields a text, such as an href or a label, takes from the record, from its `{field}` placeholders. */
export const textPlaceholders = (text: string) => [...new Set(names(text))]

/** The fields an href takes from the record, from its `{field}` placeholders. */
export const hrefPlaceholders = textPlaceholders

/** `text` with every `{field}` replaced by `value(field)`, such as a button's label by the row's values as shown. */
export const fillText = (text: string, value: (name: string) => string) => text.replace(placeholder, (_, name: string) => value(name))

const valueText = (record: Record<string, unknown>, name: string) => (record[name] === null || record[name] === undefined ? '' : String(record[name]))

const fill = (text: string, record: Record<string, unknown>) => fillText(text, (name) => valueText(record, name))

const filterPlaceholder = /(["'])\{([A-Za-z_][A-Za-z0-9_]*)\}\1|\{([A-Za-z_][A-Za-z0-9_]*)\}/g

// A quoted `{field}` in a filter takes the value as a string, its backslashes and quotes escaped, so any text stays one value.
const fillFilter = (filter: string, record: Record<string, unknown>) =>
  filter.replace(filterPlaceholder, (_, quote: string | undefined, quoted: string | undefined, bare: string | undefined) =>
    quote ? `${quote}${valueText(record, quoted!).replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`)}${quote}` : valueText(record, bare!),
  )

/**
 * `to` with every `{field}` in its resource, key, tab, run, panel, filter, order or values replaced by the record's value;
 * a missing value becomes empty, and one quoted in a filter is escaped.
 */
export const fillAddress = (to: AppAddress, record: Record<string, unknown> = {}): AppAddress => {
  if (to.kind === 'page') return to
  const resource = resourceField(to) === undefined ? to.resource : fill(to.resource, record)
  if (to.kind === 'record') {
    const part = (value: string | number) => (typeof value === 'string' ? fill(value, record) : value)
    return { ...to, resource, key: Array.isArray(to.key) ? to.key.map(part) : part(to.key as string | number), ...(to.tab !== undefined && { tab: fill(to.tab, record) }), ...(to.run !== undefined && { run: fill(to.run, record) }), ...(to.panel !== undefined && { panel: fill(to.panel, record) }) }
  }
  if (to.kind === 'create') return { ...to, resource, ...(to.values && { values: Object.fromEntries(Object.entries(to.values).map(([name, value]) => [name, fill(value, record)])) }) }
  return { ...to, resource, ...(to.filter !== undefined && { filter: fillFilter(to.filter, record) }), ...(to.orderBy !== undefined && { orderBy: fill(to.orderBy, record) }) }
}

/** The fields a list address's filter takes outside quotes, whose values go into the filter as they are, such as `{task_id}` in `task_id = {task_id}`. */
export const bareFilterFields = (to: AppAddress) =>
  to.kind === 'list' && to.filter !== undefined ? [...new Set([...to.filter.matchAll(filterPlaceholder)].flatMap((match) => (match[3] === undefined ? [] : [match[3]])))] : []

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
