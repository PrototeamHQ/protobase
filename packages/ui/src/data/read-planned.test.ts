import { describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import { readPlanned } from './read-planned'

const listed = () => {
  const urls: URL[] = []
  const fetch = async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input), 'http://x'))
    return new Response(JSON.stringify({ items: [{ id: 1 }], next_page_token: '', total_size_estimate: 1 }), { headers: { 'content-type': 'application/json' } })
  }
  return { urls, client: createClient({ fetch: fetch as typeof globalThis.fetch }) }
}

describe('readPlanned', () => {
  it('asks for no ETag for a read without one, so the server reads only its fields', async () => {
    const { urls, client } = listed()
    await readPlanned(client, { block: '/children/0', kind: 'list', resource: 'workers', fields: ['id', 'name'], etag: false })
    await readPlanned(client, { block: '/children/1', kind: 'count', resource: 'tasks', fields: ['id'], etag: false })
    expect(urls.map((url) => url.searchParams.get('etag'))).toEqual(['false', 'false'])
  })

  it('keeps the ETags of a read that asks for them', async () => {
    const { urls, client } = listed()
    await readPlanned(client, { block: '/children/0', kind: 'list', resource: 'workers', fields: ['id', 'name'], etag: true })
    expect(urls[0]!.searchParams.has('etag')).toBe(false)
  })
})
