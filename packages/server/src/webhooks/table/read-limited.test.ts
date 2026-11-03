import { describe, expect, it } from 'vitest'
import { readLimited } from './read-limited'

// A body that yields `chunk` without end and counts how often it was pulled.
const endless = (chunk: Uint8Array) => {
  const state = { pulls: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      state.pulls += 1
      controller.enqueue(chunk)
    },
    cancel: () => {
      state.cancelled = true
    },
  })
  return { response: new Response(body), state }
}

describe('readLimited', () => {
  it('reads a short body whole', async () => {
    const bytes = await readLimited(new Response('hello'), 4096)
    expect(new TextDecoder().decode(bytes)).toBe('hello')
  })

  it('returns no bytes for a response without a body', async () => {
    expect((await readLimited(new Response(null, { status: 204 }), 4096)).length).toBe(0)
  })

  it('stops at the limit and cancels an endless body', async () => {
    const { response, state } = endless(new Uint8Array(1000).fill(97))
    const bytes = await readLimited(response, 4096)
    expect(bytes.length).toBe(4096)
    expect(state.cancelled).toBe(true)
    expect(state.pulls).toBeLessThan(10)
  })
})
