import { describe, expect, it } from 'vitest'
import { FileTooLarge, incomingFile, limitedStream, readHead } from './upload-body'

const streamOf = (...chunks: string[]) => new ReadableStream<Uint8Array>({
  start: (controller) => {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
    controller.close()
  },
})

describe('upload bodies', () => {
  it('read a head across chunks, and say when it was the whole body', async () => {
    const reader = streamOf('ab', 'cd', 'ef').getReader()
    const { head, complete } = await readHead(reader, 3)
    expect(new TextDecoder().decode(head)).toBe('abcd')
    expect(complete).toBe(false)
    expect(await readHead(streamOf('ab').getReader(), 3)).toMatchObject({ complete: true })
  })

  it('stream the head and the rest, failing past the limit', async () => {
    const reader = streamOf('ab', 'cd', 'ef').getReader()
    const { head } = await readHead(reader, 1)
    expect(await new Response(limitedStream(head, reader, 6)).text()).toBe('abcdef')
    const over = streamOf('ab', 'cd', 'ef').getReader()
    await expect(new Response(limitedStream((await readHead(over, 1)).head, over, 5)).text()).rejects.toBeInstanceOf(FileTooLarge)
  })

  it('take the raw body with ?name=, or the one file of a multipart body', async () => {
    const raw = await incomingFile(new Request('http://app/api/v1/products:upload?field=image&name=a.png', { method: 'POST', body: 'x', headers: { 'content-type': 'image/png', 'content-length': '1' } }), 10)
    expect(raw).toMatchObject({ name: 'a.png', declared: 'image/png', length: 1 })

    const form = new FormData()
    form.append('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }))
    const part = await incomingFile(new Request('http://app/api/v1/products:upload?field=image', { method: 'POST', body: form }), 10)
    // Runtimes differ on whether the part's type carries a charset; the type decision drops parameters
    expect(part).toMatchObject({ name: 'hello.txt', declared: expect.stringMatching(/^text\/plain/), length: 5 })

    const two = new FormData()
    two.append('a', new File(['a'], 'a.txt'))
    two.append('b', new File(['b'], 'b.txt'))
    await expect(incomingFile(new Request('http://app/x', { method: 'POST', body: two }), 10)).rejects.toThrow('exactly one file part, not 2')
  })

  it('refuse a declared length over the limit before reading', async () => {
    await expect(incomingFile(new Request('http://app/x', { method: 'POST', body: 'xxxxxxxxxxx', headers: { 'content-length': '11' } }), 10)).rejects.toMatchObject({ status: 413 })
  })
})
