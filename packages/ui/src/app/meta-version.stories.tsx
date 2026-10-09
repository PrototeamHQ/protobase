import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiProvider, useClient } from '../data/api-provider'
import { MetaGate } from './meta-gate'

const meta = { title: 'Meta version' } satisfies Meta
export default meta

/** A `/meta` ETag and `X-Meta-Version` shaped like the server's: they hash different inputs, so they never match. */
const etag = '"9c1f4e2ab07d5536c8e1f0a4d3b29e71"'
const versions = { before: '4be8d0c61a7f2e93d5c0b8a1e6f37d24', after: '7d02a9e5c4b13f68e0d9a7c2b5f14e83' }

/**
 * Answers `/meta` (304 on a matching If-None-Match) and `/orders`, each with the current `X-Meta-Version`. Each answer
 * waits a few milliseconds like a real round-trip, so a refetch loop counts up instead of starving the page.
 */
const fakeServer = () => {
  const state = { metaCalls: 0, version: versions.before }
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    const url = String(input)
    const headers = { 'content-type': 'application/json', 'x-meta-version': state.version }
    if (url.endsWith('/api/meta')) {
      state.metaCalls += 1
      if (new Headers(init?.headers).get('if-none-match') === etag) return new Response(null, { status: 304, headers })
      return Response.json({ resources: [], views: [], permissions: {} }, { headers: { ...headers, etag } })
    }
    if (url.endsWith('/api/v1/orders')) return Response.json({ items: [], next_page_token: '', total_size_estimate: 0 }, { headers })
    throw new Error(`Unexpected request ${url}`)
  }
  return { state, fetch }
}

const server = fakeServer()

const LoadOrders = () => {
  const client = useClient()
  const [loads, setLoads] = useState(0)
  const load = async () => {
    await client.list('orders')
    setLoads((count) => count + 1)
  }
  return <button onClick={() => void load()}>Loaded {loads}</button>
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

export const RefetchesOnlyWhenVersionChanges: StoryObj = {
  tags: ['play'],
  render: () => (
    <ApiProvider fetch={server.fetch}>
      <MetaGate>
        <LoadOrders />
      </MetaGate>
    </ApiProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Loaded 0' }))
    await canvas.findByRole('button', { name: 'Loaded 1' })
    await settle()
    expect(server.state.metaCalls).toBe(1)

    server.state.version = versions.after
    await userEvent.click(canvas.getByRole('button', { name: 'Loaded 1' }))
    await canvas.findByRole('button', { name: 'Loaded 2' })
    await waitFor(() => expect(server.state.metaCalls).toBe(2))
    await settle()
    expect(server.state.metaCalls).toBe(2)
  },
}
