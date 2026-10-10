import { ApiError, type Client, type ResourcePermissions, type StoredFile, type UploadOptions, type UploadResult } from '@protobase/client'
import { evaluateCondition, parseCondition, type PageModel } from '@protobase/layout'
import { checkFilter, encodeKey, evaluateFilter, matchesSearch, parseFilter, type ResourceModel, type ViewModel } from '@protobase/schema'

type Row = Record<string, unknown>

export type FakeApiInput = {
  resources: ResourceModel[]
  views?: ViewModel[]
  pages?: PageModel[]
  rows: Record<string, Row[]>
  permissions?: Record<string, ResourcePermissions>
  /** Runs after every write, for what a database trigger or write hook would do (one default card, say). */
  afterWrite?: (resource: string, row: Row, rows: Record<string, Row[]>) => void
  /** Answers `reveal` instead of the stored value, to count reveals or refuse them. */
  reveal?: (resource: string, key: string, field: string, value: unknown) => Promise<unknown>
  /** Answers `upload` instead of accepting every file as the type the browser gave it, to refuse or correct one. */
  upload?: (resource: string, field: string, file: File, options: UploadOptions) => Promise<UploadResult>
}

const keyOf = (model: ResourceModel, row: Row) => encodeKey(model.primaryKey.map((name) => row[name] as string | number))

const notFound = () => new ApiError({ type: 'urn:protobase:problem:not-found', title: 'Not Found', status: 404, detail: 'No such record' })

// A null sorts as Postgres sorts it: after every value, so first in descending order. A value never written sorts as
// empty text, where the database would have filled in a default.
const compare = (x: unknown, y: unknown) => {
  if (x === null || y === null) return Number(x === null) - Number(y === null)
  return typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })
}

/** `a desc, b`: compares numbers as numbers, everything else as text. */
const sorter = (orderBy: string | undefined) => {
  const items = (orderBy ?? '').split(',').map((part) => part.trim().split(/\s+/)).filter(([name]) => name)
  return (a: Row, b: Row) => {
    for (const [name, direction] of items) {
      const order = compare(a[name!], b[name!])
      if (order !== 0) return direction === 'desc' ? -order : order
    }
    return 0
  }
}

const matches = (filter: string | undefined, model: ResourceModel | undefined) => {
  if (!filter) return () => true
  const search = /^search\("((?:[^"\\]|\\.)*)"\)$/.exec(filter)
  if (search) {
    const text = JSON.parse(`"${search[1]}"`) as string
    return (row: Row) => model !== undefined && matchesSearch(model, row, text)
  }
  // `in(id, 1, 2)`, which relation labels ask for; conditions do not evaluate functions.
  const among = /^in\((\w+), (.+)\)$/.exec(filter)
  if (among) {
    const values = among[2]!.split(', ').map((value) => value.replace(/^"|"$/g, ''))
    return (row: Row) => values.includes(String(row[among[1]!]))
  }
  // A filter the model accepts is evaluated like an access rule's, functions such as in() and isNull() included;
  // now() does not evaluate on dates. Others, on fields that are not filterable, are read as conditions.
  const parsed = parseFilter(filter)
  const checked = model && parsed.ok && parsed.ast ? checkFilter(model, parsed.ast) : undefined
  if (checked?.ok) return (row: Row) => evaluateFilter(checked.filter, row)
  const condition = parseCondition(filter)
  if (!condition.ok) throw new Error(`The fake API cannot read the filter ${filter}: ${condition.message}`)
  return (row: Row) => evaluateCondition(condition, row)
}

/**
 * An in-memory server for stories and docs: lists with filters (simple AIP-160), sorting, paging and exact counts, and
 * get, create, update and delete that change the rows and their ETags. Not a model of the real access rules.
 */
export const fakeApi = ({ resources, views = [], pages = [], rows: initial, permissions = {}, afterWrite, reveal, upload }: FakeApiInput) => {
  const rows: Record<string, Row[]> = structuredClone(initial)
  const models = Object.fromEntries(resources.map((model) => [model.name, model]))
  let version = 0
  const stamp = (row: Row) => ({ ...row, etag: `"v${++version}"` })
  for (const [name, list] of Object.entries(rows)) rows[name] = list.map(stamp)
  const table = (resource: string) => (rows[resource] ??= [])
  const find = (resource: string, key: string) => {
    const model = models[resource]
    const row = model && table(resource).find((entry) => keyOf(model, entry) === String(key))
    if (!row) throw notFound()
    return row
  }
  // Like the server, nothing but `reveal` hands out a sensitive value
  const shown = (resource: string, row: Row) => Object.fromEntries(Object.entries(row).filter(([name]) => !models[resource]?.fields[name]?.sensitive))
  const stored = (resource: string, row: Row) => ({ record: shown(resource, row), etag: String(row.etag) })
  // An upload's ticket becomes the file it stands for once a write sends it, as the server's attach step does
  const uploads = new Map<string, StoredFile>()
  const attached = (body: Row) => Object.fromEntries(Object.entries(body).map(([name, value]) => [name, typeof value === 'string' && uploads.has(value) ? uploads.get(value) : value]))
  const write = (resource: string, row: Row) => {
    afterWrite?.(resource, row, rows)
    for (const [name, list] of Object.entries(rows)) rows[name] = list.map((entry) => (entry === row || !entry.etag ? stamp(entry) : entry))
  }

  type ListParams = { filter?: string; orderBy?: string; pageSize?: number; pageToken?: string }
  const select = (resource: string, params: ListParams) => table(resource).filter(matches(params.filter, models[resource])).sort(sorter(params.orderBy))
  const pageAt = (resource: string, all: Row[], start: number, size: number) => ({
    items: all.slice(start, start + size).map((row) => shown(resource, row)),
    nextPageToken: start + size < all.length ? String(start + size) : '',
    prevPageToken: start > 0 ? String(Math.max(0, start - size)) : '',
    totalSizeEstimate: all.length,
    totalSize: all.length,
  })

  const client = {
    meta: async () => ({ status: 'modified' as const, etag: '"fake-meta"', meta: { resources, views, pages, permissions } }),
    list: async (resource: string, params: ListParams = {}) => pageAt(resource, select(resource, params), Number(params.pageToken || 0), params.pageSize ?? 50),
    search: async (resource: string, params: ListParams = {}) => pageAt(resource, select(resource, params), Number(params.pageToken || 0), params.pageSize ?? 50),
    seek: async (resource: string, params: ListParams & { position: number }) => pageAt(resource, select(resource, params), params.position, params.pageSize ?? 50),
    get: async (resource: string, key: string) => stored(resource, find(resource, key)),
    reveal: async (resource: string, key: string, field: string) => {
      const value = find(resource, key)[field] ?? null
      return reveal ? reveal(resource, key, field, value) : value
    },
    upload: async (resource: string, field: string, file: File, options: UploadOptions = {}) => {
      const result = upload
        ? await upload(resource, field, file, options)
        : { value: `fake-upload:${uploads.size + 1}`, file: { name: file.name, type: file.type || 'application/octet-stream', size: file.size }, derived: {} }
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined
      uploads.set(result.value, { uri: `private:1/${uploads.size + 1}?name=${encodeURIComponent(result.file.name)}`, ...result.file, ...(url && { url }) })
      options.onProgress?.(file.size, file.size)
      return result
    },
    create: async (resource: string, raw: Row) => {
      const body = attached(raw)
      const model = models[resource]!
      const [keyField] = model.primaryKey
      const row = { ...body, [keyField!]: body[keyField!] ?? table(resource).length + 1 + version }
      table(resource).push(row)
      write(resource, row)
      return { ...stored(resource, table(resource).find((entry) => keyOf(model, entry) === keyOf(model, row))!), location: '' }
    },
    update: async (resource: string, key: string, patch: Row) => {
      const row = find(resource, key)
      Object.assign(row, attached(patch))
      write(resource, row)
      return stored(resource, find(resource, key))
    },
    remove: async (resource: string, key: string) => {
      const row = find(resource, key)
      rows[resource] = table(resource).filter((entry) => entry !== row)
    },
    facets: async (resource: string, field: string, params: { filter?: string } = {}) => {
      const counts = new Map<unknown, number>()
      for (const row of select(resource, params)) counts.set(row[field] ?? null, (counts.get(row[field] ?? null) ?? 0) + 1)
      return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    },
    histogram: async (resource: string, field: string, params: { filter?: string; buckets?: number } = {}) => {
      const values = select(resource, params).map((row) => Number(row[field])).filter(Number.isFinite)
      const [min, max] = [Math.min(...values), Math.max(...values)]
      const count = params.buckets ?? 20
      const width = (max - min) / count || 1
      const buckets = Array.from({ length: count }, (_, index) => ({ from: min + index * width, to: min + (index + 1) * width, count: 0 }))
      for (const value of values) buckets[Math.min(count - 1, Math.floor((value - min) / width))]!.count += 1
      return values.length > 0 ? { min, max, buckets } : { min: null, max: null, buckets: [] }
    },
    series: async (resource: string, params: { field: string; filter?: string; granularity?: string }) => {
      const counts = new Map<string, number>()
      for (const row of select(resource, params)) {
        const day = String(row[params.field] ?? '').slice(0, 10)
        if (day) counts.set(day, (counts.get(day) ?? 0) + 1)
      }
      // Every day of the 30 up to the latest, empty ones too, as local timestamps like the real `:series`.
      const latest = [...counts.keys()].sort().at(-1)
      const days = latest ? Array.from({ length: 30 }, (_, index) => new Date(Date.parse(`${latest}T00:00:00Z`) - (29 - index) * 86_400_000).toISOString().slice(0, 10)) : []
      return { field: params.field, granularity: 'day', timeZone: 'UTC', points: days.map((day) => ({ bucket: `${day}T00:00:00`, count: counts.get(day) ?? 0 })) }
    },
  }
  return { client: client as unknown as Client, rows }
}
