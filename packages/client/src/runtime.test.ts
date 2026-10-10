import { describe, expect, it } from 'vitest'
import { ApiError } from './problem'
import { createRuntimeClient, type RuntimeStatus } from './runtime'

const status: RuntimeStatus = { version: '0.3.3', latest: '0.3.4', updateAvailable: true, indicator: true, policy: 'weekly', nextUpdateAt: '2026-10-12T03:00:00.000Z', updating: false }

// A fake runtime endpoint: records requests and answers each with the next response of `answers`.
const fakeEndpoint = (answers: Array<() => Response>) => {
  const requests: Request[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(String(input), init))
    const answer = answers.shift()
    if (!answer) throw new Error('No answer left')
    return answer()
  }) as typeof globalThis.fetch
  return { requests, fetch }
}

describe('createRuntimeClient', () => {
  it('reads the status and asks for an update with the bearer token', async () => {
    const endpoint = fakeEndpoint([() => Response.json(status), () => Response.json({ ...status, updating: true }, { status: 202 })])
    const client = createRuntimeClient({ url: 'https://cloud.example.com/apps/7/runtime/', token: async () => 'jwt-1', fetch: endpoint.fetch })
    expect(await client.status()).toEqual(status)
    expect(await client.update()).toEqual({ ...status, updating: true })
    expect(endpoint.requests.map((request) => [request.method, request.url, request.headers.get('authorization')])).toEqual([
      ['GET', 'https://cloud.example.com/apps/7/runtime', 'Bearer jwt-1'],
      ['POST', 'https://cloud.example.com/apps/7/runtime/update', 'Bearer jwt-1'],
    ])
  })

  it('rejects with the status of a refused request, problem+json or not', async () => {
    const endpoint = fakeEndpoint([() => Response.json({ error: 'already on latest' }, { status: 409, statusText: 'Conflict' }), () => new Response('Forbidden', { status: 403 })])
    const client = createRuntimeClient({ url: 'https://cloud.example.com/runtime', token: () => undefined, fetch: endpoint.fetch })
    await expect(client.update()).rejects.toMatchObject({ status: 409 })
    await expect(client.status()).rejects.toBeInstanceOf(ApiError)
    expect(endpoint.requests[0]?.headers.has('authorization')).toBe(false)
  })
})
