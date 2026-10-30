import type { KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { labelEntries, listWire, photosWire, queryString, filterText, type FilterInput, type ListParams, type MapParams } from './query-string'
import { originOf, photosWithOrigin, withFileOrigin } from './file-urls'
import { createTransport, type ClientOptions } from './transport'
import { fetchWithProgress, type UploadProgress } from './upload-request'
import { followLive, type LiveHandlers } from './live'
import { sharedLive } from './shared-live'
import { channelsClient } from './channels'
import type { SocketLike } from './channel-connection'
import { devicesClient } from './devices'
import { statusClient } from './status'
import { notificationHistoryClient } from './notification-history'
import { recordCallsClient } from './record-calls'
import { ringsClient } from './rings'
import { callGuestsClient } from './call-guests'
import type { Aggregate, AggregateParams, BatchOp, BatchResult, CommentPage, Facet, FormChallenge, FormProof, Histogram, HistoryChange, HistoryPage, ListPage, MapResult, MentionableUser, Meta, MetaResult, PublicForm, RecordComment, RecordOf, ResourceRef, Series, SeriesParams, Stored } from './types'

type Json = Record<string, any>

const nameOf = (resource: ResourceRef) => (typeof resource === 'string' ? resource : resource.toModel().name)

// `/api/channels` beside the API, as a WebSocket URL on the API's origin, the page's for a relative one.
const channelsUrl = (baseUrl = '/api/v1') => {
  const url = new URL(`${baseUrl.replace(/\/[^/]*$/, '')}/channels`, globalThis.location?.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const keyPath = (resource: ResourceRef, key: KeyValue | readonly KeyValue[]) => `/${nameOf(resource)}/${encodeKey(key)}`

/** Where a record's calls are read and followed. */
export const callsPath = (resource: ResourceRef, key: KeyValue | readonly KeyValue[]) => `${keyPath(resource, key)}:calls`

const toPage = <T>(body: Json, response: Response, origin: string | undefined): ListPage<T> => ({
  items: (body.items as T[]).map((item) => withFileOrigin(item, origin)),
  nextPageToken: body.next_page_token,
  totalSizeEstimate: body.total_size_estimate,
  ...(body.prev_page_token !== undefined && { prevPageToken: body.prev_page_token }),
  ...(body.total_size !== undefined && { totalSize: body.total_size }),
  ...(body.labels !== undefined && { labels: body.labels }),
  ...(body.photos !== undefined && { photos: photosWithOrigin(body.photos, origin) }),
  ...(response.headers.get('x-protobase-warning') && { warning: response.headers.get('x-protobase-warning')! }),
})

/** How `invoke` calls a function: GET without a body, POST with one, unless `method` says otherwise. */
export type InvokeOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON. */
  body?: unknown
  /** Below the function, such as `/42` for `/api/functions/<name>/42`. */
  path?: string
  query?: Record<string, string>
  headers?: Record<string, string>
}

/** What `upload` answers: `value` is the ticket to send as the field's value in a create, update or batch write. */
export type UploadResult = {
  value: string
  /** The type is the one detected from the content. */
  file: { name: string; type: string; size: number }
  /** Values the field's processors computed for other fields; the write stores them with the file. */
  derived: Record<string, unknown>
  /** Set when the content's type differs from what the name or browser said: `photo.png` that is a JPEG. */
  corrected?: { from: string; to: string }
}

export type UploadOptions = {
  /** Reports bytes sent; uses XMLHttpRequest where there is one, since fetch reports no upload progress. */
  onProgress?: UploadProgress
  signal?: AbortSignal
}

// A comment as the API sends it, its time in snake_case.
type CommentWire = Omit<RecordComment, 'createdAt'> & { created_at: string }
const commentOf = ({ created_at, ...comment }: CommentWire): RecordComment => ({ ...comment, createdAt: created_at })

const etagOf = (response: Response) => response.headers.get('etag') ?? ''

/** A single-record response: the record without its `permissions` member, which travels beside it. */
const storedOf = async <T>(response: Response, origin: string | undefined): Promise<Stored<T>> => {
  const { permissions, ...record } = await response.json()
  return { record: withFileOrigin(record as T, origin), etag: etagOf(response), ...(permissions && { permissions }) }
}

// The records of a batch's results, each file downloading from the API's origin.
const batchResultOf = (body: Partial<BatchResult>, origin: string | undefined): BatchResult => ({
  results: (body.results ?? []).map((result) => {
    if (result.op === 'create' || result.op === 'update') return { ...result, record: withFileOrigin(result.record, origin) }
    if (result.op === 'reorder') return { ...result, records: result.records.map((entry) => ({ ...entry, record: withFileOrigin(entry.record, origin) })) }
    return result
  }),
})

/**
 * The client of one API. With an absolute `baseUrl`, the URL of each file in a record it answers is absolute too, on
 * that API's origin; with a path, it stays the path the API answers.
 */
export const createClient = (options: ClientOptions = {}) => {
  const send = createTransport(options)
  const origin = originOf(options.baseUrl)

  const list = async <R extends ResourceRef>(resource: R, params?: ListParams) => {
    const response = await send({ method: 'GET', path: `/${nameOf(resource)}`, query: queryString(listWire(params)) })
    return toPage<RecordOf<R>>(await response.json(), response, origin)
  }

  /** Same as `list`, with the parameters in a JSON body, for long filters. */
  const search = async <R extends ResourceRef>(resource: R, params?: ListParams) => {
    const wire = listWire(params)
    const response = await send({
      method: 'POST',
      path: `/${nameOf(resource)}:search`,
      body: { ...wire, fields: params?.fields, labels: labelEntries(params?.labels) },
    })
    return toPage<RecordOf<R>>(await response.json(), response, origin)
  }

  const get = async <R extends ResourceRef>(resource: R, key: KeyValue | readonly KeyValue[]): Promise<Stored<RecordOf<R>>> => {
    return storedOf(await send({ method: 'GET', path: keyPath(resource, key) }), origin)
  }

  const create = async <R extends ResourceRef>(resource: R, body: Partial<RecordOf<R>>): Promise<Stored<RecordOf<R>> & { location: string }> => {
    const response = await send({ method: 'POST', path: `/${nameOf(resource)}`, body })
    return { record: withFileOrigin(await response.json(), origin), etag: etagOf(response), location: response.headers.get('location') ?? '' }
  }

  /** `etag` is what `get` returned; a stale one rejects with `PreconditionFailedError`. */
  const update = async <R extends ResourceRef>(
    resource: R,
    key: KeyValue | readonly KeyValue[],
    patch: Partial<RecordOf<R>>,
    etag: string,
  ): Promise<Stored<RecordOf<R>>> => {
    return storedOf(await send({ method: 'PATCH', path: keyPath(resource, key), body: patch, headers: { 'if-match': etag } }), origin)
  }

  /** `etag` is the version the user saw (`*` for any); a stale one rejects with `PreconditionFailedError`. */
  const remove = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], { etag }: { etag?: string } = {}) => {
    await send({ method: 'DELETE', path: keyPath(resource, key), headers: etag ? { 'if-match': etag } : undefined })
  }

  /** AIP-164: brings a soft-deleted record back. A record that is not deleted answers 409. */
  const undelete = async <R extends ResourceRef>(resource: R, key: KeyValue | readonly KeyValue[]): Promise<Stored<RecordOf<R>>> => {
    const response = await send({ method: 'POST', path: `${keyPath(resource, key)}:undelete` })
    return { record: withFileOrigin(await response.json(), origin), etag: etagOf(response) }
  }

  /** The value of a sensitive field of one record, which the record itself never carries. The server audits every call. */
  const reveal = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], field: string): Promise<unknown> => {
    const response = await send({ method: 'POST', path: `${keyPath(resource, key)}:reveal`, body: { field } })
    return ((await response.json()) as { value: unknown }).value
  }

  /**
   * Runs the record's AI action `action` (`a.ai`): the model writes the action's field from its prompt, as the caller.
   * Resolves to the record as written; a record changed while the model answered rejects with `PreconditionFailedError`.
   */
  const generate = async <R extends ResourceRef>(resource: R, key: KeyValue | readonly KeyValue[], action: string): Promise<Stored<RecordOf<R>>> =>
    storedOf(await send({ method: 'POST', path: `${keyPath(resource, key)}:generate`, body: { action } }), origin)

  /** A page of a record's changes, newest first, for a resource with `.history()`; `pageToken` is the previous page's `nextPageToken`. */
  const history = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], { pageSize, pageToken }: { pageSize?: number; pageToken?: string } = {}): Promise<HistoryPage> => {
    const query = queryString({ page_size: pageSize, page_token: pageToken || undefined })
    const body = (await (await send({ method: 'GET', path: `${keyPath(resource, key)}:history`, query })).json()) as { items: Array<Omit<HistoryChange, 'databaseRole'> & { database_role: string | null }>; next_page_token: string }
    return { items: body.items.map(({ database_role, ...change }) => ({ ...change, databaseRole: database_role })), nextPageToken: body.next_page_token }
  }

  /** A page of a record's comments, newest first, for a resource with `.comments()`; `pageToken` is the previous page's `nextPageToken`. */
  const comments = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], { pageSize, pageToken }: { pageSize?: number; pageToken?: string } = {}): Promise<CommentPage> => {
    const query = queryString({ page_size: pageSize, page_token: pageToken || undefined })
    const body = (await (await send({ method: 'GET', path: `${keyPath(resource, key)}:comments`, query })).json()) as { items: CommentWire[]; next_page_token: string }
    return { items: body.items.map(commentOf), nextPageToken: body.next_page_token }
  }

  /** Adds the caller's comment to a record, mentioning the users `mentions` names, who are emailed a link to it. */
  const comment = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], { body, mentions = [] }: { body: string; mentions?: string[] }): Promise<RecordComment> =>
    commentOf((await (await send({ method: 'POST', path: `${keyPath(resource, key)}:comments`, body: { body, mentions } })).json()) as CommentWire)

  /** The users a comment on a record may mention whose name contains `query`, at most 8, by name. */
  const mentionable = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], query: string): Promise<MentionableUser[]> => {
    const body = (await (await send({ method: 'GET', path: `${keyPath(resource, key)}:mentionable`, query: queryString({ q: query }) })).json()) as { items: MentionableUser[] }
    return body.items
  }

  /** Applies several writes atomically (`POST /api/v1:batchWrite`), for example a record and its lines on Save. */
  const batchWrite = async (ops: BatchOp[]): Promise<BatchResult> => {
    const keyText = (key: unknown) => (typeof key === 'object' && key !== null && '$ref' in key ? key : encodeKey(key as KeyValue | readonly KeyValue[]))
    const wireOps = ops.map((operation) => ({
      ...operation,
      resource: nameOf(operation.resource),
      ...('key' in operation && { key: keyText(operation.key) }),
      ...(operation.op === 'reorder' && { keys: operation.keys.map(keyText) }),
    }))
    const response = await send({ method: 'POST', path: ':batchWrite', body: { ops: wireOps } })
    return batchResultOf((await response.json()) as Partial<BatchResult>, origin)
  }

  /** `label` names a relation's values by that field of the records they point at, as a list's `labels` does. */
  const facets = async (resource: ResourceRef, field: string, o: { filter?: FilterInput; limit?: number; label?: string } = {}) => {
    const response = await send({
      method: 'GET',
      path: `/${nameOf(resource)}:facets`,
      query: queryString({ field, filter: filterText(o.filter) || undefined, limit: o.limit, label: o.label }),
    })
    return ((await response.json()) as { facets: Facet[] }).facets
  }

  /** Totals per value of a field, or per bucket of a date field (`:aggregate`). */
  const aggregate = async (resource: ResourceRef, params: AggregateParams): Promise<Aggregate> => {
    const response = await send({
      method: 'GET',
      path: `/${nameOf(resource)}:aggregate`,
      query: queryString({
        group_by: params.groupBy,
        filter: filterText(params.filter) || undefined,
        sum: params.sum,
        average: params.average,
        maximum: params.maximum,
        limit: params.limit,
        label: params.label,
        granularity: params.granularity,
        range: params.range,
        from: params.from,
        to: params.to,
        time_zone: params.timeZone,
        split_by: params.splitBy,
        split_limit: params.splitLimit,
        split_label: params.splitLabel,
      }),
    })
    const body = await response.json()
    return {
      groupBy: body.group_by,
      granularity: body.granularity,
      timeZone: body.time_zone,
      groups: body.groups,
      ...(body.split_by !== undefined && { splitBy: body.split_by, splits: body.splits }),
    }
  }

  const series = async (resource: ResourceRef, params: SeriesParams & { filter?: FilterInput }): Promise<Series> => {
    const response = await send({
      method: 'GET',
      path: `/${nameOf(resource)}:series`,
      query: queryString({
        field: params.field,
        range: params.range,
        from: params.from,
        to: params.to,
        granularity: params.granularity,
        time_zone: params.timeZone,
        filter: filterText(params.filter) || undefined,
      }),
    })
    const body = await response.json()
    return { field: body.field, granularity: body.granularity, timeZone: body.time_zone, points: body.points }
  }

  const histogram = async (resource: ResourceRef, field: string, o: { filter?: FilterInput; buckets?: number } = {}): Promise<Histogram> => {
    const response = await send({
      method: 'GET',
      path: `/${nameOf(resource)}:histogram`,
      query: queryString({ field, buckets: o.buckets, filter: filterText(o.filter) || undefined }),
    })
    return response.json()
  }

  /**
   * The records in a map's view, its bounding box being part of `filter`: the records themselves when few match or the
   * map is close, else buckets of them on a grid sized for `zoom`.
   */
  const map = async <R extends ResourceRef>(resource: R, params: MapParams): Promise<MapResult<RecordOf<R>>> => {
    const response = await send({
      method: 'GET',
      path: `/${nameOf(resource)}:map`,
      query: queryString({
        latitude: params.latitude,
        longitude: params.longitude,
        zoom: params.zoom,
        filter: filterText(params.filter) || undefined,
        order_by: params.orderBy,
        fields: params.fields?.join(','),
        labels: labelEntries(params.labels)?.join(','),
        ...photosWire(params.photos),
      }),
    })
    const body = await response.json()
    return {
      items: (body.items as RecordOf<R>[]).map((item) => withFileOrigin(item, origin)),
      buckets: body.buckets,
      totalSize: body.total_size,
      ...(body.labels !== undefined && { labels: body.labels }),
      ...(body.photos !== undefined && { photos: photosWithOrigin(body.photos, origin) }),
    }
  }

  /** The page that starts at row `position` of a sort (scrollbar jumps), with the tokens of its own neighbours. Past the end it is empty. */
  const seek = async <R extends ResourceRef>(resource: R, params: ListParams & { position: number }) => {
    const response = await send({ method: 'GET', path: `/${nameOf(resource)}:seek`, query: queryString({ ...listWire(params), position: params.position }) })
    return toPage<RecordOf<R>>(await response.json(), response, origin)
  }

  /** Pass the `etag` of the last result to get `{ status: 'unchanged' }` on a `304`; `signal` gives up waiting. */
  const meta = async (etag?: string, { signal }: { signal?: AbortSignal } = {}): Promise<MetaResult> => {
    const response = await send({ method: 'GET', path: '/meta', system: true, headers: etag ? { 'if-none-match': etag } : undefined, accept: [304], ...(signal && { signal }) })
    if (response.status === 304) return { status: 'unchanged' }
    return { status: 'modified', meta: (await response.json()) as Meta, etag: etagOf(response) }
  }

  /**
   * Calls one of the app's API functions, `/api/functions/<name>`, with the user's token. Resolves to its answer: parsed
   * JSON, text for `text/*` or no content type, a `Blob` of any other type (a PDF, an image), or `undefined` for a 204.
   * A problem rejects as from any other call.
   */
  const invoke = async <T = unknown>(name: string, { method, body, path = '', query, headers }: InvokeOptions = {}): Promise<T> => {
    const response = await send({
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      path: `/functions/${encodeURIComponent(name)}${path}`,
      query: query ? `?${new URLSearchParams(query)}` : '',
      body,
      headers,
      system: true,
    })
    if (response.status === 204) return undefined as T
    const type = response.headers.get('content-type')
    if (type?.includes('json')) return response.json() as Promise<T>
    if (!type || type.startsWith('text/')) return response.text() as Promise<T>
    return response.blob() as Promise<T>
  }

  /**
   * Uploads a file for a file field (`POST /{resource}:upload`). Send `value` of the result as the field's value in a
   * create, update or batch write within 24 hours; the server detects the type and refuses one the field does not take.
   */
  const upload = async (resource: ResourceRef, field: string, file: Blob, { onProgress, signal }: UploadOptions = {}): Promise<UploadResult> => {
    const name = 'name' in file && typeof file.name === 'string' ? file.name : undefined
    const progress = onProgress && typeof XMLHttpRequest !== 'undefined' ? fetchWithProgress(onProgress) : undefined
    const response = await send({
      method: 'POST',
      path: `/${nameOf(resource)}:upload`,
      query: `?${new URLSearchParams({ field, ...(name !== undefined && { name }) })}`,
      raw: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
      ...(progress && { via: progress }),
      ...(signal && { signal }),
    })
    const result = (await response.json()) as UploadResult
    onProgress?.(file.size, file.size)
    return result
  }

  // Public forms live beside the API and need no token: anyone may send one.
  const formPath = (name: string) => `/forms/${encodeURIComponent(name)}`

  /** The public form `name` (`GET /api/forms/<name>`): its fields as `/meta` would give them, its title and thanks text. */
  const form = async (name: string): Promise<PublicForm> => (await send({ method: 'GET', path: formPath(name), system: true })).json()

  /** A fresh bot check for the public form `name`, to solve with `altcha-lib`'s `solveChallenge` before sending it. */
  const formChallenge = async (name: string): Promise<FormChallenge> => (await send({ method: 'GET', path: `${formPath(name)}:challenge`, system: true })).json()

  /**
   * Sends the public form `name`: creates its record from `values`, with the solved bot check. Rejects with `ApiError`
   * as a create does, a refused check as `bot-check-failed` and too many submissions as `too-many-submissions`.
   */
  const submitForm = async (name: string, values: Record<string, unknown>, proof: FormProof): Promise<void> => {
    await send({ method: 'POST', path: formPath(name), body: { values, proof }, system: true })
  }

  /**
   * Hears which records of the `.live()` resources the caller may read change, as they do, until the returned function
   * is called (`GET /api/live`); it connects again by itself.
   */
  const live = sharedLive((handlers: LiveHandlers) => followLive(send, handlers))

  /**
   * The channel of a record (`/api/channels`): who else is on it and what they track (presence), and the events they
   * send (broadcasts), for whoever may read the record. Every channel of the client shares one socket.
   */
  const { channel } = channelsClient({
    url: () => channelsUrl(options.baseUrl),
    ...(options.token && { token: () => options.token!({ refresh: false }) }),
    socket: options.webSocket ?? ((url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike),
    retryDelay: (attempt) => Math.min(30_000, 1000 * 2 ** attempt),
  })

  /** The signed-in user's own devices, where they receive push (see `devicesClient`). */
  const devices = devicesClient(send)

  /** The signed-in user's own notification history, their inbox (see `notificationHistoryClient`). */
  const notifications = notificationHistoryClient(send)

  /** A record's calls, live with `watchCalls`, for whoever may read the record (see `recordCallsClient`). */
  const { calls, watchCalls } = recordCallsClient(send, callsPath)

  /** People's own status, and that of those who share an organization with the signed-in person (see `statusClient`). */
  const status = statusClient(send)

  /** The calls that ring the signed-in user, and declining one (see `ringsClient`). */
  const rings = ringsClient(send)

  /** Whether the calls of the organization the signed-in user works in take guests (see `callGuestsClient`). */
  const callGuests = callGuestsClient(send)

  return { list, search, get, create, update, remove, undelete, generate, reveal, history, comments, comment, mentionable, batchWrite, facets, aggregate, series, histogram, map, seek, meta, invoke, upload, form, formChallenge, submitForm, live, channel, devices, notifications, status, calls, watchCalls, rings, callGuests }
}

export type Client = ReturnType<typeof createClient>
