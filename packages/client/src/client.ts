import { encodeKey, type KeyValue } from '@protobase/schema'
import { listWire, queryString, filterText, type FilterInput, type ListParams } from './query-string'
import { createTransport, type ClientOptions } from './transport'
import { fetchWithProgress, type UploadProgress } from './upload-request'
import type { BatchOp, BatchResult, Facet, Histogram, ListPage, Meta, MetaResult, RecordOf, ResourceRef, Series, SeriesParams, Stored } from './types'

type Json = Record<string, any>

const nameOf = (resource: ResourceRef) => (typeof resource === 'string' ? resource : resource.toModel().name)

const keyPath = (resource: ResourceRef, key: KeyValue | readonly KeyValue[]) => `/${nameOf(resource)}/${encodeKey(key)}`

const toPage = <T>(body: Json, response: Response): ListPage<T> => ({
  items: body.items,
  nextPageToken: body.next_page_token,
  totalSizeEstimate: body.total_size_estimate,
  ...(body.prev_page_token !== undefined && { prevPageToken: body.prev_page_token }),
  ...(body.total_size !== undefined && { totalSize: body.total_size }),
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

const etagOf = (response: Response) => response.headers.get('etag') ?? ''

/** A single-record response: the record without its `permissions` member, which travels beside it. */
const storedOf = async <T>(response: Response): Promise<Stored<T>> => {
  const { permissions, ...record } = await response.json()
  return { record: record as T, etag: etagOf(response), ...(permissions && { permissions }) }
}

export const createClient = (options: ClientOptions = {}) => {
  const send = createTransport(options)

  const list = async <R extends ResourceRef>(resource: R, params?: ListParams) => {
    const response = await send({ method: 'GET', path: `/${nameOf(resource)}`, query: queryString(listWire(params)) })
    return toPage<RecordOf<R>>(await response.json(), response)
  }

  /** Same as `list`, with the parameters in a JSON body, for long filters. */
  const search = async <R extends ResourceRef>(resource: R, params?: ListParams) => {
    const wire = listWire(params)
    const response = await send({
      method: 'POST',
      path: `/${nameOf(resource)}:search`,
      body: { ...wire, fields: params?.fields },
    })
    return toPage<RecordOf<R>>(await response.json(), response)
  }

  const get = async <R extends ResourceRef>(resource: R, key: KeyValue | readonly KeyValue[]): Promise<Stored<RecordOf<R>>> => {
    return storedOf(await send({ method: 'GET', path: keyPath(resource, key) }))
  }

  const create = async <R extends ResourceRef>(resource: R, body: Partial<RecordOf<R>>): Promise<Stored<RecordOf<R>> & { location: string }> => {
    const response = await send({ method: 'POST', path: `/${nameOf(resource)}`, body })
    return { record: await response.json(), etag: etagOf(response), location: response.headers.get('location') ?? '' }
  }

  /** `etag` is what `get` returned; a stale one rejects with `PreconditionFailedError`. */
  const update = async <R extends ResourceRef>(
    resource: R,
    key: KeyValue | readonly KeyValue[],
    patch: Partial<RecordOf<R>>,
    etag: string,
  ): Promise<Stored<RecordOf<R>>> => {
    return storedOf(await send({ method: 'PATCH', path: keyPath(resource, key), body: patch, headers: { 'if-match': etag } }))
  }

  /** `etag` is the version the user saw (`*` for any); a stale one rejects with `PreconditionFailedError`. */
  const remove = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], { etag }: { etag?: string } = {}) => {
    await send({ method: 'DELETE', path: keyPath(resource, key), headers: etag ? { 'if-match': etag } : undefined })
  }

  /** AIP-164: brings a soft-deleted record back. A record that is not deleted answers 409. */
  const undelete = async <R extends ResourceRef>(resource: R, key: KeyValue | readonly KeyValue[]): Promise<Stored<RecordOf<R>>> => {
    const response = await send({ method: 'POST', path: `${keyPath(resource, key)}:undelete` })
    return { record: await response.json(), etag: etagOf(response) }
  }

  /** The value of a sensitive field of one record, which the record itself never carries. The server audits every call. */
  const reveal = async (resource: ResourceRef, key: KeyValue | readonly KeyValue[], field: string): Promise<unknown> => {
    const response = await send({ method: 'POST', path: `${keyPath(resource, key)}:reveal`, body: { field } })
    return ((await response.json()) as { value: unknown }).value
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
    const body = (await response.json()) as Partial<BatchResult>
    return { results: body.results ?? [] }
  }

  const facets = async (resource: ResourceRef, field: string, o: { filter?: FilterInput; limit?: number } = {}) => {
    const response = await send({
      method: 'GET',
      path: `/${nameOf(resource)}:facets`,
      query: queryString({ field, filter: filterText(o.filter) || undefined, limit: o.limit }),
    })
    return ((await response.json()) as { facets: Facet[] }).facets
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

  /** The page that starts at row `position` of a sort (scrollbar jumps), with the tokens of its own neighbours. Past the end it is empty. */
  const seek = async <R extends ResourceRef>(resource: R, params: ListParams & { position: number }) => {
    const response = await send({ method: 'GET', path: `/${nameOf(resource)}:seek`, query: queryString({ ...listWire(params), position: params.position }) })
    return toPage<RecordOf<R>>(await response.json(), response)
  }

  /** Pass the `etag` of the last result to get `{ status: 'unchanged' }` on a `304`. */
  const meta = async (etag?: string): Promise<MetaResult> => {
    const response = await send({ method: 'GET', path: '/meta', system: true, headers: etag ? { 'if-none-match': etag } : undefined, accept: [304] })
    if (response.status === 304) return { status: 'unchanged' }
    return { status: 'modified', meta: (await response.json()) as Meta, etag: etagOf(response) }
  }

  /**
   * Calls one of the app's API functions, `/api/functions/<name>`, with the user's token. Resolves to its answer: parsed
   * JSON, text, or `undefined` for a 204. A problem rejects as from any other call.
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
    return (response.headers.get('content-type')?.includes('json') ? response.json() : response.text()) as Promise<T>
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

  return { list, search, get, create, update, remove, undelete, reveal, batchWrite, facets, series, histogram, seek, meta, invoke, upload }
}

export type Client = ReturnType<typeof createClient>
