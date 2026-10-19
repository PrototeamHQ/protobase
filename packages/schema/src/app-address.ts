import { encodeKey } from './keys'
import type { AppAddress, CalendarView, FilterLayout, MapView } from './model'

/**
 * The words of the app's addresses. Only `appPath` and `readAppPath` write and read them, so the shape of an address
 * changes in this module alone.
 */
export const addressWords = {
  /** A list's filter (AIP-160), as the list API takes it. An empty `filter=` means no filter, in place of the view's default. */
  filter: 'filter',
  /** A list's order (AIP-132). */
  orderBy: 'order_by',
  /** The list display shown, when it is not the view's default. */
  display: 'display',
  /** Where a list's filters sit: `bar` (the default) or `panel`. */
  filterLayout: 'layout',
  /** Where a list's map display looks: `latitude,longitude,zoom`. */
  map: 'map',
  /** The month or week a list's calendar display shows: `month,YYYY-MM-DD` or `week,YYYY-MM-DD`. */
  calendar: 'calendar',
  /** The saved search a list was opened from, by its key. */
  savedSearch: 'saved_search',
  /** The second path segment that opens a resource's create form instead of a record. */
  create: 'new',
  /** A record's form, `edit=true`, on a view whose record page opens as a read view or locked. */
  edit: 'edit',
  /** A record page's open collapsed group, by title, once per group. */
  open: 'open',
} as const

const listWords = ['display', 'filter', 'orderBy', 'filterLayout', 'savedSearch'] as const

// Five decimals of a degree are about a metre; two of a zoom are less than a pixel's difference.
const mapText = (view: MapView) => `${view.latitude.toFixed(5)},${view.longitude.toFixed(5)},${view.zoom.toFixed(2)}`

const inRange = (value: number, limit: number, low = -limit) => Number.isFinite(value) && value >= low && value <= limit

// A map view as `mapText` writes it, or none for anything else
const readMap = (text: string | null): MapView | undefined => {
  const parts = text?.split(',')
  if (parts?.length !== 3 || parts.some((part) => part.trim() === '')) return undefined
  const [latitude, longitude, zoom] = parts.map(Number) as [number, number, number]
  return inRange(latitude, 90) && inRange(longitude, 180) && inRange(zoom, 22, 0) ? { latitude, longitude, zoom } : undefined
}

const calendarText = (view: CalendarView) => `${view.scale},${view.day}`

// A real day as `YYYY-MM-DD`: one whose parts come back from `Date.UTC`, so 2026-02-30 is none
const isDay = (text: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// A calendar view as `calendarText` writes it, or none for anything else
const readCalendar = (text: string | null): CalendarView | undefined => {
  const parts = text?.split(',')
  if (parts?.length !== 2) return undefined
  const [scale, day] = parts as [string, string]
  return (scale === 'month' || scale === 'week') && isDay(day) ? { scale, day } : undefined
}

const listQuery = (address: Extract<AppAddress, { kind: 'list' }>) => {
  const query = new URLSearchParams()
  for (const name of listWords) {
    const value = address[name]
    if (value === undefined || (value === '' && name !== 'filter')) continue
    query.set(addressWords[name], value)
  }
  if (address.map) query.set(addressWords.map, mapText(address.map))
  if (address.calendar) query.set(addressWords.calendar, calendarText(address.calendar))
  const text = query.toString()
  return text ? `?${text}` : ''
}

const recordQuery = (address: Extract<AppAddress, { kind: 'record' }>) => {
  const query = new URLSearchParams()
  if (address.edit) query.set(addressWords.edit, 'true')
  for (const title of address.open ?? []) query.append(addressWords.open, title)
  const text = query.toString()
  return text ? `?${text}` : ''
}

/** The path of `address` below `basePath` (such as `/admin`), every name and key encoded the one way the app reads them. */
export const appPath = (address: AppAddress, basePath = ''): string => {
  switch (address.kind) {
    case 'page':
      return `${basePath}/${encodeURIComponent(address.page)}`
    case 'create':
      return `${basePath}/${encodeURIComponent(address.resource)}/${addressWords.create}${valuesQuery(address.values)}`
    case 'record':
      return `${basePath}/${encodeURIComponent(address.resource)}/${encodeURIComponent(encodeKey(address.key))}${recordQuery(address)}`
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

// A create form's values, by field name, as the query.
const valuesQuery = (values: Readonly<Record<string, string>> = {}) => {
  const text = new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '')).toString()
  return text ? `?${text}` : ''
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
  if (second === addressWords.create) {
    const values = Object.fromEntries([...url.searchParams].filter(([, value]) => value !== ''))
    return { kind: 'create', resource: first, ...(Object.keys(values).length > 0 && { values }) }
  }
  if (second !== undefined) {
    const open = [...new Set(url.searchParams.getAll(addressWords.open).filter((title) => title !== ''))]
    return { kind: 'record', resource: first, key: second, ...(url.searchParams.get(addressWords.edit) === 'true' && { edit: true }), ...(open.length > 0 && { open }) }
  }
  const params = url.searchParams
  const display = params.get(addressWords.display) || undefined
  const filter = params.get(addressWords.filter) ?? undefined
  const orderBy = params.get(addressWords.orderBy) || undefined
  const layout = filterLayout(params.get(addressWords.filterLayout))
  const map = readMap(params.get(addressWords.map))
  const calendar = readCalendar(params.get(addressWords.calendar))
  const savedSearch = params.get(addressWords.savedSearch) || undefined
  return {
    kind: 'list',
    resource: first,
    ...(display && { display }),
    ...(filter !== undefined && { filter }),
    ...(orderBy && { orderBy }),
    ...(layout && { filterLayout: layout }),
    ...(map && { map }),
    ...(calendar && { calendar }),
    ...(savedSearch && { savedSearch }),
  }
}
