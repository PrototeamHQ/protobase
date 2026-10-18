import { describe, expect, it } from 'vitest'
import { createClient } from './client'
import { routedClient } from './routed-client'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

// Two APIs, each answering with what was asked of it.
const apis = () => {
  const urls: string[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input))
    if (String(input).endsWith(':batchWrite')) return json({ results: [] })
    if (String(input).endsWith('/meta')) return json({ resources: [], views: [] })
    return json({ items: [], next_page_token: '', total_size_estimate: 0, id: 1 })
  }) as typeof globalThis.fetch
  const own = createClient({ fetch })
  const desk = createClient({ baseUrl: 'https://desk.example.com/api/v1', fetch })
  const client = routedClient(own, (resource) => (resource === 'tickets' || resource === 'notes' ? desk : undefined))
  return { urls, client }
}

describe('routedClient', () => {
  it("sends a call about a resource to the API that serves it, and meta, functions and forms to the app's own", async () => {
    const { urls, client } = apis()
    await client.list('tickets', { pageSize: 5 })
    await client.get('notes', 3)
    await client.list('orders')
    await client.meta()
    await client.invoke('ping')
    await client.form('contact')
    expect(urls).toEqual([
      'https://desk.example.com/api/v1/tickets?page_size=5',
      'https://desk.example.com/api/v1/notes/3',
      '/api/v1/orders',
      '/api/meta',
      '/api/functions/ping',
      '/api/forms/contact',
    ])
  })

  it('sends a batch to the one API its writes are for, and refuses one for two before sending anything', async () => {
    const { urls, client } = apis()
    await client.batchWrite([{ op: 'create', resource: 'tickets', data: {} }, { op: 'delete', resource: 'notes', key: 1 }])
    expect(urls).toEqual(['https://desk.example.com/api/v1:batchWrite'])
    await expect(client.batchWrite([{ op: 'create', resource: 'tickets', data: {} }, { op: 'create', resource: 'orders', data: {} }])).rejects.toThrow(
      'A batch writes to one API, but these writes are for tickets, orders, which different APIs serve',
    )
    expect(urls).toHaveLength(1)
  })
})
