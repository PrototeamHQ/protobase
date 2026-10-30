import { expect, it } from 'vitest'
import { readEventStream } from './event-stream'

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })

it('yields the data of each event across chunk boundaries, skipping comments and other fields', async () => {
  const data: string[] = []
  await readEventStream(streamOf([': keep-alive\n\nevent: x\nid: 1\ndata: {"a"', ':1}\n\ndata: one\r\ndata:two\r\n\r\n', 'data: last']), (value) => data.push(value))
  expect(data).toEqual(['{"a":1}', 'one\ntwo', 'last'])
})

it('ends a line at a CR whose LF comes in the next chunk, without an event in between', async () => {
  const data: string[] = []
  await readEventStream(streamOf(['data: one\r', '\ndata: two\r\n\r\n']), (value) => data.push(value))
  expect(data).toEqual(['one\ntwo'])
})

it('stops at an abort, handing on only the events read so far', async () => {
  const data: string[] = []
  const abort = new AbortController()
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode('data: first\n\n'))
    },
  })
  const reading = readEventStream(body, (value) => {
    data.push(value)
    abort.abort()
  }, abort.signal)
  await reading
  expect(data).toEqual(['first'])
})
