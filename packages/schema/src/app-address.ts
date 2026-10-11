import { encodeKey } from './keys'
import type { KeyValue } from './model'

/**
 * The words of the app's addresses. Only `appPath` and `readAppPath` write and read them, so the shape of an address
 * changes in this module alone.
 */
export const addressWords = {
  /** A list's filter (AIP-160), as the list API takes it. */
  filter: 'filter',
  /** A list's order (AIP-132). */
  orderBy: 'order_by',
  /** The list display shown, when it is not the view's default. */
  display: 'display',
  /** Where a list's filters sit: `bar` (the default) or `panel`. */
  filterLayout: 'layout',
  /** The second path segment that opens a resource's create form instead of a record. */
  create: 'new',
} as const

export type FilterLayout = 'bar' | 'panel'

/**
 * A place in the app: a resource's list, one of its records, its create form, or a composed page. A record's `key` is
 * its one value or its parts, as the record API takes them; `readAppPath` gives it back as the API's text form.
 */
export type AppAddress =
  | { kind: 'list'; resource: string; filter?: string; orderBy?: string; display?: string; filterLayout?: FilterLayout }
  | { kind: 'record'; resource: string; key: KeyValue | readonly KeyValue[] }
  | { kind: 'create'; resource: string }
  | { kind: 'page'; page: string }

const listWords = ['display', 'filter', 'orderBy', 'filterLayout'] as const

const listQuery = (address: Extract<AppAddress, { kind: 'list' }>) => {
  const query = new URLSearchParams()
  for (const name of listWords) {
    const value = address[name]
    if (value !== undefined && value !== '') query.set(addressWords[name], value)
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

/** The path of `address` below `basePath` (such as `/admin`), every name and key encoded the one way the app reads them. */
export const appPath = (address: AppAddress, basePath = ''): string => {
  switch (address.kind) {
    case 'page':
      return `${basePath}/${encodeURIComponent(address.page)}`
    case 'create':
      return `${basePath}/${encodeURIComponent(address.resource)}/${addressWords.create}`
    case 'record':
      return `${basePath}/${encodeURIComponent(address.resource)}/${encodeURIComponent(encodeKey(address.key))}`
    case 'list':
      return `${basePath}/${encodeURIComponent(address.resource)}${listQuery(address)}`
  }
}

const decodeSegments = (pathname: string) => {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch (error) {
    if (error instanceof URIError) return undefined
    throw error
  }
}

const filterLayout = (value: string | null): FilterLayout | undefined => (value === 'bar' || value === 'panel' ? value : undefined)

/**
 * The address `pathAndQuery` (below the base path) shows, or `undefined` for anything else: the root, the app's own
 * pages under `/-/`, or a path that is not one. A first segment in `pages` is a composed page, otherwise a resource.
 */
export const readAppPath = (pathAndQuery: string, pages: ReadonlySet<string>): AppAddress | undefined => {
  const url = new URL(pathAndQuery, 'http://app')
  const segments = decodeSegments(url.pathname)
  if (!segments || segments.length === 0 || segments.length > 2) return undefined
  const [first, second] = segments as [string, string | undefined]
  if (first === '-') return undefined
  if (pages.has(first)) return second === undefined ? { kind: 'page', page: first } : undefined
  if (second === addressWords.create) return { kind: 'create', resource: first }
  if (second !== undefined) return { kind: 'record', resource: first, key: second }
  const params = url.searchParams
  const display = params.get(addressWords.display) || undefined
  const filter = params.get(addressWords.filter) || undefined
  const orderBy = params.get(addressWords.orderBy) || undefined
  const layout = filterLayout(params.get(addressWords.filterLayout))
  return { kind: 'list', resource: first, ...(display && { display }), ...(filter && { filter }), ...(orderBy && { orderBy }), ...(layout && { filterLayout: layout }) }
}
