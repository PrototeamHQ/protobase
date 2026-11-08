import { describe, expect, it } from 'vitest'
import { createClient } from './client'

describe('workflowTypes', () => {
  it("reads the app's workflow types beside the API", async () => {
    const list = { step_types: [{ id: 'app:http', kind: 'step', label: 'HTTP request', description: '', input: { type: 'object' }, available: true }], triggers: [] }
    const urls: string[] = []
    const fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return Response.json(list)
    }) as typeof globalThis.fetch
    const { workflowTypes } = createClient({ fetch, baseUrl: 'https://app.example/api/v1', token: async () => 'token' })
    expect(await workflowTypes()).toEqual(list)
    expect(urls).toEqual(['https://app.example/api/workflows/types'])
  })
})
