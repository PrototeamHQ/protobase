import { ApiError, type Client, type HistoryChange, type MentionableUser, type RecordComment, type MapLayerModel, type PluginRef, type PublicForm, type ResourcePermissions, type SourceRef, type StoredFile, type UploadOptions, type UploadResult } from '@protobase/client'
import { evaluateCondition, parseCondition, type PageModel } from '@protobase/layout'
import { checkFilter, evaluateFilter, parseFilter, type BottomBarModel, type CardPhotosModel, type ResourceModel, type SignInViewModel, type ViewModel } from '@protobase/schema'
import { cardPhotoLimit, encodeKey, matchesSearch } from '@protobase/schema/internal'
import { fakeForms } from './fake-forms'

type Row = Record<string, unknown>

export type FakeApiInput = {
  resources: ResourceModel[]
  views?: ViewModel[]
  pages?: PageModel[]
  rows: Record<string, Row[]>
  permissions?: Record<string, ResourcePermissions>
  /** The plugins `/meta` names. */
  plugins?: PluginRef[]
  /** The sources `/meta` names, whose resources another fake API serves (`App`'s `sources`). */
  sources?: SourceRef[]
  /** The map style `/meta` names, and the layers the maps may switch to. */
  maps?: { style: string; layers?: MapLayerModel[] }
  /** The trusted image hosts `/meta` names. */
  files?: { trustedHosts: string[] }
  /** The bottom bar `/meta` names. */
  bottomBar?: Omit<BottomBarModel, 'roles'>
  /** The sign-in prompts `/meta` names, as it does for a visitor. */
  signIn?: SignInViewModel[]
  /** Runs after every write, for what a database trigger or write hook would do (one default card, say). */
  afterWrite?: (resource: string, row: Row, rows: Record<string, Row[]>) => void
  /** Answers `reveal` instead of the stored value, to count reveals or refuse them. */
  reveal?: (resource: string, key: string, field: string, value: unknown) => Promise<unknown>
  /** Answers `upload` instead of accepting every file as the type the browser gave it, to refuse or correct one. */
  upload?: (resource: string, field: string, file: File, options: UploadOptions) => Promise<UploadResult>
  /**
   * The changes kept before the story starts, oldest first, by `<resource>/<key>`, for resources with history; every
   * create and update adds one, made by `actor`.
   */
  history?: Record<string, HistoryChange[]>
  /** Who the history says made the story's own writes, and who writes the story's comments. */
  actor?: HistoryChange['actor']
  /** The comments written before the story starts, oldest first, by `<resource>/<key>`, for resources with comments. */
  comments?: Record<string, RecordComment[]>
  /** The users a comment may mention, all of whom may read every record; the actor is never offered. */
  users?: MentionableUser[]
  /** The public forms it serves; a submission with a solved check creates a row of the form's resource. */
  forms?: PublicForm[]
  /** Answers a public form's submission instead of creating the row, to refuse it. */
  submitForm?: (name: string, values: Row) => Promise<void>
  /** What the model writes when an AI action (`a.ai`) runs, as the fields it sets; rejects to answer a failure. */
  generate?: (resource: string, key: string, action: string) => Promise<Row>
}

const keyOf = (model: ResourceModel, row: Row) => encodeKey(model.primaryKey.map((name) => row[name] as string | number))

const stale = () => new ApiError({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'The record changed since it was read; fetch it again' })
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
 * An in-memory server for stories and docs: lists with filters (simple AIP-160), sorting, paging, exact counts,
 * related names and photos, and get, create, update and delete that change the rows and their ETags. Not a model of the real access rules.
 */
// The buckets from the first to the last every `strideMs`, those without records holding none
const filled = <G extends { value: unknown; count: number }>(groups: G[], strideMs: number, nothing: Record<string, null>) => {
  const byValue = new Map(groups.map((group) => [String(group.value), group]))
  const first = Date.parse(`${String(groups[0]!.value)}Z`)
  const last = Date.parse(`${String(groups.at(-1)!.value)}Z`)
  return Array.from({ length: (last - first) / strideMs + 1 }, (_, index) => {
    const value = new Date(first + index * strideMs).toISOString().slice(0, 19)
    return byValue.get(value) ?? ({ value, count: 0, ...nothing } as unknown as G)
  })
}

export const fakeApi = ({ resources, views = [], pages = [], rows: initial, permissions = {}, plugins, sources, maps, files, bottomBar, signIn, afterWrite, reveal, upload, history: initialHistory = {}, actor = { id: 'story', name: 'Story User' }, comments: initialComments = {}, users = [], forms = [], submitForm, generate }: FakeApiInput) => {
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
  // Like the server, a change keeps no sensitive value, though it names a sensitive field that changed
  const history: Record<string, HistoryChange[]> = structuredClone(initialHistory)
  const keep = (resource: string, operation: HistoryChange['operation'], before: Row | undefined, after: Row) => {
    const model = models[resource]!
    if (!model.history) return
    const changed = before ? Object.keys(model.fields).filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name])) : []
    const values = (row: Row) => Object.fromEntries(Object.keys(model.fields).filter((name) => !model.fields[name]!.sensitive).map((name) => [name, row[name] ?? null]))
    const list = (history[`${resource}/${keyOf(model, after)}`] ??= [])
    list.push({ id: String(list.length + 1), at: new Date().toISOString(), operation, changed, ...(before && { before: values(before) }), after: values(after), actor, databaseRole: 'app' })
  }
  // The posted comments, which a story reads back to see whom one mentioned
  const comments: Record<string, RecordComment[]> = structuredClone(initialComments)
  const write = (resource: string, row: Row) => {
    afterWrite?.(resource, row, rows)
    for (const [name, list] of Object.entries(rows)) rows[name] = list.map((entry) => (entry === row || !entry.etag ? stamp(entry) : entry))
  }

  type ListParams = { filter?: string; orderBy?: string; pageSize?: number; pageToken?: string; labels?: Record<string, string>; photos?: CardPhotosModel }
  const select = (resource: string, params: ListParams) => table(resource).filter(matches(params.filter, models[resource])).sort(sorter(params.orderBy))
  // The names `labels` asks for: each relation's records among the fake's rows, by key, those with a name
  const namesOf = (resource: string, items: Row[], labels: Record<string, string>) =>
    Object.fromEntries(Object.entries(labels).map(([relation, field]) => {
      const target = models[models[resource]?.fields[relation]?.relation?.resource ?? '']
      const keys = new Set(items.flatMap((item) => (item[relation] == null ? [] : [String(item[relation])])))
      const named = target ? table(target.name).filter((row) => keys.has(keyOf(target, row)) && row[field] != null) : []
      return [relation, Object.fromEntries(named.map((row) => [keyOf(target!, row), String(row[field])]))]
    }))
  // The photos `photos` asks for: each item's first ones among the fake's rows, in their order, those it has
  const photosOf = (resource: string, items: Row[], photos: CardPhotosModel) => {
    const key = models[resource]!.primaryKey[0]!
    return Object.fromEntries(items.flatMap((item) => {
      const own = select(photos.resource, { orderBy: photos.sort }).filter((row) => String(row[photos.field]) === String(item[key]) && row[photos.image] != null)
      return own.length > 0 ? [[String(item[key]), own.slice(0, cardPhotoLimit).map((row) => row[photos.image] as StoredFile)]] : []
    }))
  }
  const pageAt = (resource: string, all: Row[], start: number, size: number, { labels, photos }: ListParams) => {
    const items = all.slice(start, start + size).map((row) => shown(resource, row))
    return {
      items,
      nextPageToken: start + size < all.length ? String(start + size) : '',
      prevPageToken: start > 0 ? String(Math.max(0, start - size)) : '',
      totalSizeEstimate: all.length,
      totalSize: all.length,
      ...(labels && { labels: namesOf(resource, items, labels) }),
      ...(photos && { photos: photosOf(resource, items, photos) }),
    }
  }

  // A batch write's `update`, as a ranked board's drop sends it, or `reorder`, as sorting by hand does: the records
  // numbered `start`, `start` + 1, ... (1, 2, 3, ... by default) in the order of their keys. A record is refused when its ETag is stale; unlike the server, the
  // fake keeps the operations before a refused one
  type BatchOp = { op: string; resource: string; key?: string | number; data?: Row; etag?: string; field?: string; keys?: Array<string | number>; start?: number; etags?: Record<string, string> }
  const batchOp = async (op: BatchOp) => {
    if (op.op === 'update') {
      const key = String(op.key)
      if (![undefined, '*', find(op.resource, key).etag].includes(op.etag)) throw stale()
      return { op: 'update', resource: op.resource, ...(await client.update(op.resource, key, op.data!)) }
    }
    if (op.op !== 'reorder') throw new Error(`Not implemented: the fake API's batch writes only update and reorder, not ${op.op}`)
    const { resource, field } = op as { resource: string; field: string }
    const keys = op.keys!.map(String)
    const start = op.start ?? 1
    const changing = keys.filter((key, index) => find(resource, key)[field] !== start + index)
    if (changing.some((key) => ![undefined, '*', find(resource, key).etag].includes(op.etags?.[key]))) throw stale()
    for (const key of changing) {
      const row = find(resource, key)
      row[field] = start + keys.indexOf(key)
      write(resource, row)
    }
    const records = keys.map((key) => stored(resource, find(resource, key)))
    return { op: 'reorder', resource, records }
  }

  const client = {
    meta: async () => ({ status: 'modified' as const, etag: '"fake-meta"', meta: { appName: 'Protobase', resources, views, pages, permissions, ...(plugins && { plugins }), ...(sources && { sources }), ...(maps && { maps }), ...(files && { files }), ...(bottomBar && { bottomBar }), ...(signIn && { signIn }) } }),
    list: async (resource: string, params: ListParams = {}) => pageAt(resource, select(resource, params), Number(params.pageToken || 0), params.pageSize ?? 50, params),
    search: async (resource: string, params: ListParams = {}) => pageAt(resource, select(resource, params), Number(params.pageToken || 0), params.pageSize ?? 50, params),
    seek: async (resource: string, params: ListParams & { position: number }) => pageAt(resource, select(resource, params), params.position, params.pageSize ?? 50, params),
    // The records in the map's bounding box, never buckets of them, as the real `:map` answers for a few records.
    map: async (resource: string, params: ListParams) => {
      const { items, totalSize, labels, photos } = pageAt(resource, select(resource, params), 0, 200, params)
      return { items, buckets: [], totalSize, ...(labels && { labels }), ...(photos && { photos }) }
    },
    get: async (resource: string, key: string) => stored(resource, find(resource, key)),
    reveal: async (resource: string, key: string, field: string) => {
      const value = find(resource, key)[field] ?? null
      return reveal ? reveal(resource, key, field, value) : value
    },
    history: async (resource: string, key: string, { pageSize = 20, pageToken = '' }: { pageSize?: number; pageToken?: string } = {}) => {
      find(resource, key)
      const newest = [...(history[`${resource}/${key}`] ?? [])].reverse()
      const start = Number(pageToken || 0)
      return { items: newest.slice(start, start + pageSize), nextPageToken: start + pageSize < newest.length ? String(start + pageSize) : '' }
    },
    comments: async (resource: string, key: string, { pageSize = 20, pageToken = '' }: { pageSize?: number; pageToken?: string } = {}) => {
      find(resource, key)
      const newest = [...(comments[`${resource}/${key}`] ?? [])].reverse()
      const start = Number(pageToken || 0)
      return { items: newest.slice(start, start + pageSize), nextPageToken: start + pageSize < newest.length ? String(start + pageSize) : '' }
    },
    comment: async (resource: string, key: string, { body, mentions = [] }: { body: string; mentions?: string[] }) => {
      find(resource, key)
      const list = (comments[`${resource}/${key}`] ??= [])
      const author = actor ?? { id: 'story' }
      const named = mentions.map((id) => {
        const user = users.find((entry) => entry.id === id)
        return user ? { id, name: user.name } : { id }
      })
      const comment = { id: String(list.length + 1), createdAt: new Date().toISOString(), body: body.trim(), author, mentions: named }
      list.push(comment)
      return comment
    },
    mentionable: async (resource: string, key: string, query: string) => {
      find(resource, key)
      return users.filter((user) => user.id !== actor?.id && user.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
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
      keep(resource, 'create', undefined, row)
      write(resource, row)
      return { ...stored(resource, table(resource).find((entry) => keyOf(model, entry) === keyOf(model, row))!), location: '' }
    },
    update: async (resource: string, key: string, patch: Row) => {
      const row = find(resource, key)
      const before = { ...row }
      Object.assign(row, attached(patch))
      keep(resource, 'update', before, row)
      write(resource, row)
      return stored(resource, find(resource, key))
    },
    generate: async (resource: string, key: string, action: string) => {
      if (!generate) throw new Error(`Not implemented: the fake API has no model to run the AI action "${action}"`)
      return client.update(resource, key, await generate(resource, key, action))
    },
    batchWrite: async (ops: BatchOp[]) => {
      const results = []
      for (const op of ops) results.push(await batchOp(op))
      return { results }
    },
    remove: async (resource: string, key: string) => {
      const row = find(resource, key)
      rows[resource] = table(resource).filter((entry) => entry !== row)
    },
    facets: async (resource: string, field: string, params: { filter?: string; label?: string } = {}) => {
      const counts = new Map<unknown, number>()
      for (const row of select(resource, params)) counts.set(row[field] ?? null, (counts.get(row[field] ?? null) ?? 0) + 1)
      const values = [...counts].map(([value]) => ({ [field]: value }))
      const names: Record<string, string> = params.label ? (namesOf(resource, values, { [field]: params.label })[field] ?? {}) : {}
      return [...counts]
        .map(([value, count]) => ({ value, count, ...(value !== null && names[String(value)] !== undefined && { label: names[String(value)] }) }))
        .sort((a, b) => b.count - a.count)
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
    // Like the real `:aggregate`, except that a date field's buckets run from its earliest to its latest record and
    // ignore the range, so a story shows the same chart whatever day it runs.
    aggregate: async (resource: string, params: { groupBy: string; filter?: string; sum?: string; average?: string; maximum?: string; limit?: number; label?: string; granularity?: string; splitBy?: string; splitLimit?: number; splitLabel?: string }) => {
      const measured = params.sum ?? params.average ?? params.maximum
      const kind = params.sum !== undefined ? 'sum' : params.average !== undefined ? 'average' : 'maximum'
      const type = models[resource]?.fields[params.groupBy]?.type
      const dated = type === 'date' || type === 'timestamp'
      const granularity = params.granularity ?? 'day'
      // Buckets shorter than a day, empty ones included, as samples over the last hour or day are read
      const strideMs = { minute: 60_000, '5_minutes': 300_000, '15_minutes': 900_000, hour: 3_600_000 }[granularity]
      const bucketOf = (value: unknown) => {
        const text = String(value)
        if (strideMs !== undefined) return new Date(Math.floor(Date.parse(text) / strideMs) * strideMs).toISOString().slice(0, 19)
        if (granularity === 'year') return `${text.slice(0, 4)}-01-01T00:00:00`
        if (granularity === 'month') return `${text.slice(0, 7)}-01T00:00:00`
        return `${text.slice(0, 10)}T00:00:00`
      }
      const groups = new Map<unknown, Row[]>()
      for (const row of select(resource, params)) {
        const value = row[params.groupBy] ?? null
        const key = dated && value !== null ? bucketOf(value) : value
        groups.set(key, [...(groups.get(key) ?? []), row])
      }
      const total = (rows: Row[]) => {
        if (measured === undefined) return {}
        const values = rows.map((row) => row[measured]).filter((value) => value !== null && value !== undefined).map(Number)
        const sum = values.reduce((all, value) => all + value, 0)
        if (values.length === 0) return { [kind]: null }
        return { [kind]: kind === 'sum' ? sum : kind === 'maximum' ? Math.max(...values) : sum / values.length }
      }
      const totals = [...groups].map(([value, rows]) => ({ value, count: rows.length, ...total(rows) }))
      if (dated) {
        const present = totals.filter((group) => group.value !== null).sort((a, b) => String(a.value).localeCompare(String(b.value)))
        const sorted = strideMs === undefined || present.length === 0 ? present : filled(present, strideMs, measured === undefined ? {} : { [kind]: null })
        const { splitBy } = params
        if (splitBy === undefined) return { groupBy: params.groupBy, granularity, timeZone: 'UTC', groups: sorted }
        // The split values rank over all the selected rows, by the sum, else by count; each group keeps those it holds
        const parts = (rows: Row[]) => {
          const byValue = new Map<unknown, Row[]>()
          for (const row of rows) byValue.set(row[splitBy] ?? null, [...(byValue.get(row[splitBy] ?? null) ?? []), row])
          return byValue
        }
        const rank = (rows: Row[]) => (kind === 'sum' && measured !== undefined ? Number(total(rows).sum ?? -Infinity) : rows.length)
        const kept = [...parts([...groups.values()].flat())].sort(([, a], [, b]) => rank(b) - rank(a)).slice(0, params.splitLimit ?? 8).map(([value]) => value)
        const names: Record<string, string> = params.splitLabel ? (namesOf(resource, kept.map((value) => ({ [splitBy]: value })), { [splitBy]: params.splitLabel })[splitBy] ?? {}) : {}
        const splits = kept.map((value) => (value !== null && names[String(value)] !== undefined ? { value, label: names[String(value)] } : { value }))
        const withSplits = sorted.map((group) => {
          const held = parts(groups.get(group.value) ?? [])
          return { ...group, splits: kept.filter((value) => held.has(value)).map((value) => ({ value, count: held.get(value)!.length, ...total(held.get(value)!) })) }
        })
        return { groupBy: params.groupBy, granularity, timeZone: 'UTC', groups: withSplits, splitBy, splits }
      }
      const size = (group: Row) => Number(measured === undefined ? group.count : (group[kind] ?? -Infinity))
      const ranked = totals.sort((a, b) => size(b) - size(a)).slice(0, params.limit ?? 100)
      const names: Record<string, string> = params.label ? (namesOf(resource, ranked.map((group) => ({ [params.groupBy]: group.value })), { [params.groupBy]: params.label })[params.groupBy] ?? {}) : {}
      const groupsOut = ranked.map((group) => (group.value !== null && names[String(group.value)] !== undefined ? { ...group, label: names[String(group.value)] } : group))
      return { groupBy: params.groupBy, groups: groupsOut }
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
  return { client: { ...client, ...fakeForms(forms, client.create, submitForm) } as unknown as Client, rows, comments }
}
