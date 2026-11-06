import { describe, expect, it } from 'vitest'
import { readBody } from './read-body'

// A body streamed in chunks, with no declared length.
const streamed = (chunks: number[]) => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      const next = chunks.shift()
      if (next === undefined) controller.close()
      else controller.enqueue(new Uint8Array(next))
    },
    cancel: () => void (cancelled = true),
  })
  return { request: new Request('http://localhost/', { method: 'POST', body, duplex: 'half' } as RequestInit), cancelled: () => cancelled }
}

describe('readBody', () => {
  it('reads a body up to the limit', async () => {
    expect(await readBody(new Request('http://localhost/', { method: 'POST', body: 'hello' }), 5)).toEqual(new TextEncoder().encode('hello'))
    expect(await readBody(new Request('http://localhost/', { method: 'POST' }), 5)).toEqual(new Uint8Array())
  })

  it('refuses a declared length over the limit before reading', async () => {
    const request = new Request('http://localhost/', { method: 'POST', body: 'hello', headers: { 'content-length': '6' } })
    expect(await readBody(request, 5)).toBeUndefined()
  })

  it('counts a streamed body without a length and stops at the limit', async () => {
    const { request, cancelled } = streamed([4, 4, 4, 4])
    expect(await readBody(request, 10)).toBeUndefined()
    expect(cancelled()).toBe(true)
    expect(await readBody(streamed([4, 4, 2]).request, 10)).toHaveLength(10)
  })
})
