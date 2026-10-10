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
