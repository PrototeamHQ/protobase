import { describe, expect, it } from 'vitest'
import { f, resource, where } from '@protobase/schema'
import { createClient } from './client'
import { ApiError, PreconditionFailedError } from './problem'

type Call = { url: string; init: RequestInit }

const fakeFetch = (respond: (call: Call) => Response) => {
  const calls: Call[] = []
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init }
    calls.push(call)
    return respond(call)
  }
  return { calls, fetch: fetch as typeof globalThis.fetch }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init.headers } })

const problem = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: Number(body.status), headers: { 'content-type': 'application/problem+json' } })

const orders = resource('orders')
  .table('sales.orders')
  .fields({ id: f.uuid().readOnly(), status: f.enum(['draft', 'shipped']), total: f.decimal({ precision: 10, scale: 2 }) })
  .primaryKey((r) => r.id)

const lines = resource('lines')
  .table('sales.lines')
  .fields({ orderId: f.text(), position: f.integer() })
  .primaryKey((r) => [r.orderId, r.position])

describe('list', () => {
  it('builds the query string', async () => {
    const { calls, fetch } = fakeFetch(() => json({ items: [], next_page_token: '', total_size_estimate: 0 }))
    await createClient({ fetch }).list('orders', { filter: 'status = "draft"', orderBy: 'createdAt desc', pageSize: 25, pageToken: 'abc', fields: ['id', 'status'], count: 'exact' })
    const url = new URL(calls[0]!.url, 'http://x')
    expect(url.pathname).toBe('/api/v1/orders')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      filter: 'status = "draft"',
      order_by: 'createdAt desc',
      page_size: '25',
      page_token: 'abc',
      fields: 'id,status',
      count: 'exact',
    })
  })

  it('prints where-builder filters as AIP-160', async () => {
    const { calls, fetch } = fakeFetch(() => json({ items: [], next_page_token: '', total_size_estimate: 0 }))
    await createClient({ fetch }).list(orders, { filter: where.and(where.eq('status', 'draft'), where.gt('total', '10')) })
    const filter = new URL(calls[0]!.url, 'http://x').searchParams.get('filter')
    expect(filter).toBe('status = "draft" AND total > "10"')
  })

  it('omits empty parameters and maps the page to camelCase', async () => {
    const { calls, fetch } = fakeFetch(() => json({ items: [{ id: 'a' }], next_page_token: 'next', total_size_estimate: 12, total_size: 11 }, { headers: { 'x-protobase-warning': 'scan' } }))
    const page = await createClient({ fetch }).list('orders', { filter: '', pageToken: '' })
    expect(calls[0]!.url).toBe('/api/v1/orders')
    expect(page).toEqual({ items: [{ id: 'a' }], nextPageToken: 'next', totalSizeEstimate: 12, totalSize: 11, warning: 'scan' })
  })

  it('searches with a JSON body', async () => {
    const { calls, fetch } = fakeFetch(() => json({ items: [], next_page_token: '', total_size_estimate: 0 }))
    await createClient({ fetch }).search('orders', { filter: 'a = 1', fields: ['id'] })
    expect(calls[0]!.url).toBe('/api/v1/orders:search')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ filter: 'a = 1', fields: ['id'] })
  })

  it('uses a custom base URL and headers', async () => {
    const { calls, fetch } = fakeFetch(() => json({ items: [], next_page_token: '', total_size_estimate: 0 }))
    await createClient({ fetch, baseUrl: 'http://api.test/api/v1', headers: () => ({ authorization: 'Bearer t' }) }).list('orders')
    expect(calls[0]!.url).toBe('http://api.test/api/v1/orders')
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer t' })
  })
})

describe('records and ETags', () => {
  it('round-trips the ETag through update', async () => {
    const { calls, fetch } = fakeFetch(({ init }) =>
      init.method === 'PATCH' ? json({ id: 'a', status: 'shipped' }, { headers: { etag: '"t2"' } }) : json({ id: 'a', status: 'draft' }, { headers: { etag: '"t1"' } }),
    )
    const client = createClient({ fetch })
    const { record, etag } = await client.get('orders', 'a')
    expect(etag).toBe('"t1"')
    const updated = await client.update('orders', record.id as string, { status: 'shipped' }, etag)
    expect(updated.etag).toBe('"t2"')
    expect(calls[1]!.init.method).toBe('PATCH')
    expect(calls[1]!.init.headers).toMatchObject({ 'if-match': '"t1"', 'content-type': 'application/json' })
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ status: 'shipped' })
  })

  it('encodes composite keys', async () => {
    const { calls, fetch } = fakeFetch(() => json({}))
    await createClient({ fetch }).get(lines, ['a/b', 2])
    expect(calls[0]!.url).toBe('/api/v1/lines/a%2Fb,2')
  })

  it('returns the Location of a created record', async () => {
    const { fetch } = fakeFetch(() => json({ id: 'n' }, { status: 201, headers: { etag: '"t1"', location: '/api/v1/orders/n' } }))
    const created = await createClient({ fetch }).create('orders', { status: 'draft' })
    expect(created).toEqual({ record: { id: 'n' }, etag: '"t1"', location: '/api/v1/orders/n' })
  })

  it('deletes with an optional If-Match', async () => {
    const { calls, fetch } = fakeFetch(() => new Response(null, { status: 204 }))
    await createClient({ fetch }).remove('orders', 'a', { etag: '"t1"' })
    expect(calls[0]!.init.method).toBe('DELETE')
    expect(calls[0]!.init.headers).toMatchObject({ 'if-match': '"t1"' })
  })
})

describe('remove with a version', () => {
  it('sends If-Match and works without one', async () => {
    const { calls, fetch } = fakeFetch(() => new Response(null, { status: 204 }))
    const client = createClient({ fetch })
    await client.remove('orders', 'a', { etag: '*' })
    await client.remove('orders', 'b')
    expect(calls[0]!.init.headers).toMatchObject({ 'if-match': '*' })
    expect(calls[1]!.init.headers).not.toHaveProperty('if-match')
  })

  it('turns a 412 into PreconditionFailedError and keeps the record', async () => {
    const { fetch } = fakeFetch(() => problem({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'The record changed' }))
    const error = await createClient({ fetch }).remove('orders', 'a', { etag: '"old"' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PreconditionFailedError)
    expect((error as PreconditionFailedError).status).toBe(412)
  })
})

describe('undelete', () => {
  it('posts to the :undelete method of the record', async () => {
    const { calls, fetch } = fakeFetch(() => json({ id: 'a' }, { headers: { etag: '"t3"' } }))
    const restored = await createClient({ fetch }).undelete('products', 7)
    expect(calls[0]!.url).toBe('/api/v1/products/7:undelete')
    expect(calls[0]!.init.method).toBe('POST')
    expect(restored).toEqual({ record: { id: 'a' }, etag: '"t3"' })
  })

  it('reports a record that is not deleted as a 409', async () => {
    const { fetch } = fakeFetch(() => problem({ type: 'urn:protobase:problem:conflict', title: 'Conflict', status: 409, detail: 'Not deleted' }))
    const error = (await createClient({ fetch }).undelete('products', 7).catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(409)
  })
})

describe('batchWrite', () => {
  it('posts every operation to :batchWrite with keys and resource names in wire form', async () => {
    const { calls, fetch } = fakeFetch(() => json({ results: [{ id: 'a' }, {}] }))
    const result = await createClient({ fetch }).batchWrite([
      { op: 'update', resource: orders, key: 'a', data: { status: 'shipped' }, etag: '"t1"' },
      { op: 'reorder', resource: 'invoiceLines', field: 'position', keys: [3, 1, 2], etags: { 3: '"c"', 1: '"a"', 2: '"b"' } },
      { op: 'delete', resource: lines, key: ['x/y', 2], etag: '"d"' },
      { op: 'create', resource: 'invoiceLines', data: { description: 'New' }, ref: 'line' },
      { op: 'update', resource: 'invoices', key: { $ref: 'line', field: 'invoiceId' }, data: {} },
    ])
    expect(calls[0]!.url).toBe('/api/v1:batchWrite')
    expect(calls[0]!.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      ops: [
        { op: 'update', resource: 'orders', key: 'a', data: { status: 'shipped' }, etag: '"t1"' },
        { op: 'reorder', resource: 'invoiceLines', field: 'position', keys: ['3', '1', '2'], etags: { 3: '"c"', 1: '"a"', 2: '"b"' } },
        { op: 'delete', resource: 'lines', key: 'x%2Fy,2', etag: '"d"' },
        { op: 'create', resource: 'invoiceLines', data: { description: 'New' }, ref: 'line' },
        { op: 'update', resource: 'invoices', key: { $ref: 'line', field: 'invoiceId' }, data: {} },
      ],
    })
    expect(result.results).toHaveLength(2)
  })

  it('rejects with the problem that names the failing operation, and a 412 as PreconditionFailedError', async () => {
    const stale = fakeFetch(() => problem({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'Operation 1 is stale', operation: 1 }))
    const error = await createClient({ fetch: stale.fetch }).batchWrite([{ op: 'delete', resource: 'orders', key: 'a' }]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PreconditionFailedError)
    expect((error as ApiError).problem.operation).toBe(1)
  })
})

describe('permissions', () => {
  it('passes the per-resource permissions from /meta through', async () => {
    const permissions = { orders: { create: false, update: true, delete: false, conditional: ['delete'] } }
    const { fetch } = fakeFetch(() => json({ resources: [], views: [], permissions }, { headers: { etag: '"m1"' } }))
    const result = await createClient({ fetch }).meta()
    expect(result.status === 'modified' && result.meta.permissions).toEqual(permissions)
  })

  it('reports a 403 on a delete the server refuses for this record', async () => {
    const { fetch } = fakeFetch(() => problem({ type: 'urn:protobase:problem:access-denied', title: 'Forbidden', status: 403, detail: 'You may only delete orders you own.' }))
    const error = (await createClient({ fetch }).remove('orders', 'a', { etag: '"t1"' }).catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.slug).toBe('access-denied')
    expect(error.message).toBe('You may only delete orders you own.')
  })
})

describe('errors', () => {
  it('maps 412 to PreconditionFailedError', async () => {
    const { fetch } = fakeFetch(() => problem({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'stale' }))
    const error = await createClient({ fetch }).update('orders', 'a', {}, '"old"').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PreconditionFailedError)
    expect((error as ApiError).slug).toBe('precondition-failed')
  })

  it('keeps filter error spans', async () => {
    const { fetch } = fakeFetch(() =>
      problem({
        type: 'urn:protobase:problem:invalid-filter',
        title: 'Bad Request',
        status: 400,
        detail: 'Unknown field',
        parameter: 'filter',
        errors: [{ code: 'unknown-field', message: 'Unknown field "stat"', hint: 'status', span: { start: 0, end: 4 } }],
      }),
    )
    const error = (await createClient({ fetch }).list('orders', { filter: 'stat = 1' }).catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.filterErrors[0]?.span).toEqual({ start: 0, end: 4 })
    expect(error.message).toBe('Unknown field')
  })

  it('wraps responses that are not problem+json', async () => {
    const { fetch } = fakeFetch(() => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
    const error = (await createClient({ fetch }).list('orders').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(502)
    expect(error.slug).toBe('unknown')
  })
})

describe('invoke', () => {
  it('calls a function beside the API with the token: GET without a body, POST with JSON', async () => {
    const { calls, fetch } = fakeFetch(() => json({ ok: true }))
    const client = createClient({ fetch, baseUrl: '/api/v1', token: async () => 'tok' })
    expect(await client.invoke('hello')).toEqual({ ok: true })
    await client.invoke('send-invoice', { body: { orderId: 7 }, path: '/now', query: { dry: 'true' } })
    await client.invoke('orders', { method: 'DELETE', path: '/7' })

    expect(calls.map(({ url, init }) => [init.method, url, init.body])).toEqual([
      ['GET', '/api/functions/hello', undefined],
      ['POST', '/api/functions/send-invoice/now?dry=true', '{"orderId":7}'],
      ['DELETE', '/api/functions/orders/7', undefined],
    ])
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer tok' })
  })

  it('resolves to text or nothing when the function answers so, and rejects with its problem', async () => {
    const answers = [new Response('pong', { headers: { 'content-type': 'text/plain' } }), new Response(null, { status: 204 }), problem({ status: 403, title: 'Forbidden', type: 'urn:protobase:problem:function-forbidden', detail: 'No' })]
    const { fetch } = fakeFetch(() => answers.shift()!)
    const client = createClient({ fetch })
    expect(await client.invoke('ping')).toBe('pong')
    expect(await client.invoke('noop', { method: 'POST' })).toBeUndefined()
    await expect(client.invoke('report')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('meta', () => {
  it('sends If-None-Match and understands 304', async () => {
    const { calls, fetch } = fakeFetch(({ init }) => (init.headers && 'if-none-match' in init.headers ? new Response(null, { status: 304 }) : json({ resources: [], views: [] }, { headers: { etag: '"m1"' } })))
    const client = createClient({ fetch })
    const first = await client.meta()
    expect(first).toEqual({ status: 'modified', meta: { resources: [], views: [] }, etag: '"m1"' })
    const second = await client.meta('"m1"')
    expect(second).toEqual({ status: 'unchanged' })
    expect(calls[1]!.init.headers).toMatchObject({ 'if-none-match': '"m1"' })
  })

  it('reads /meta beside the API, not inside it', async () => {
    const { calls, fetch } = fakeFetch(() => json({ resources: [], views: [] }, { headers: { etag: '"m1"' } }))
    await createClient({ fetch, baseUrl: '/api/v1' }).meta()
    expect(calls[0]!.url).toBe('/api/meta')
  })

  it('reports X-Meta-Version', async () => {
    const seen: string[] = []
    const { fetch } = fakeFetch(() => json({ items: [], next_page_token: '', total_size_estimate: 0 }, { headers: { 'x-meta-version': 'v9' } }))
    await createClient({ fetch, onMetaVersion: (version) => seen.push(version) }).list('orders')
    expect(seen).toEqual(['v9'])
  })
})

describe('aggregates', () => {
  it('reads facets, series and a seek page', async () => {
    const { calls, fetch } = fakeFetch(({ url }) => {
      if (url.includes(':facets')) return json({ field: 'status', facets: [{ value: 'draft', count: 3 }] })
      if (url.includes(':series')) return json({ field: 'createdAt', granularity: 'day', time_zone: 'UTC', points: [{ bucket: 'b', count: 1 }] })
      return json({ items: [{ id: 1 }], next_page_token: 'next', prev_page_token: 'prev', total_size_estimate: 9 })
    })
    const client = createClient({ fetch })
    expect(await client.facets('orders', 'status', { filter: 'paid = true', limit: 5 })).toEqual([{ value: 'draft', count: 3 }])
    expect((await client.series('orders', { field: 'createdAt', range: '30d', granularity: 'day', timeZone: 'UTC' })).timeZone).toBe('UTC')
    const page = await client.seek('orders', { orderBy: 'createdAt desc', position: 500, pageSize: 40 })
    expect(page).toMatchObject({ items: [{ id: 1 }], nextPageToken: 'next', prevPageToken: 'prev' })
    expect(new URL(calls[2]!.url, 'http://x').pathname).toBe('/api/v1/orders:seek')
    expect(new URL(calls[0]!.url, 'http://x').searchParams.get('limit')).toBe('5')
    expect(new URL(calls[1]!.url, 'http://x').searchParams.get('time_zone')).toBe('UTC')
    expect(new URL(calls[2]!.url, 'http://x').searchParams.get('position')).toBe('500')
  })
})

describe('upload', () => {
  it('posts the raw file with its name and type, and answers with the ticket', async () => {
    const result = { value: 'private:1/a.png?name=a.png&size=3&exp=1&sig=x', file: { name: 'a.png', type: 'image/png', size: 3 }, derived: {} }
    const { calls, fetch } = fakeFetch(() => json(result, { status: 201 }))
    const sent: number[] = []
    const uploaded = await createClient({ fetch, token: async () => 'tok' }).upload(orders, 'image', new File(['abc'], 'a.png', { type: 'image/png' }), { onProgress: (bytes) => sent.push(bytes) })
    expect(uploaded).toEqual(result)
    expect(calls[0]!.url).toBe('/api/v1/orders:upload?field=image&name=a.png')
    expect(calls[0]!.init.headers).toMatchObject({ 'content-type': 'image/png', authorization: 'Bearer tok' })
    expect(await new Response(calls[0]!.init.body as Blob).text()).toBe('abc')
    // Without XMLHttpRequest (Node) the progress comes once, at the end
    expect(sent).toEqual([3])
  })

  it('sends a blob without a name as an octet stream, and rejects with the problem', async () => {
    const { calls, fetch } = fakeFetch(() => problem({ type: 'urn:protobase:problem:unsupported-type', title: 'Unsupported Media Type', status: 415, detail: 'This field takes image/*; the file is application/pdf' }))
    const error = await createClient({ fetch }).upload('orders', 'image', new Blob(['%PDF'])).catch((caught: unknown) => caught)
    expect(calls[0]!.url).toBe('/api/v1/orders:upload?field=image')
    expect(calls[0]!.init.headers).toMatchObject({ 'content-type': 'application/octet-stream' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).slug).toBe('unsupported-type')
  })
})
