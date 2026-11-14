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

// Collects unhandled rejections in place of the test runner's own handler, which fails the run on one
const catchUnhandled = async (run: () => Promise<void>) => {
  const runners = process.listeners('unhandledRejection')
  const caught: unknown[] = []
  const collect = (reason: unknown) => void caught.push(reason)
  process.removeAllListeners('unhandledRejection')
  process.on('unhandledRejection', collect)
  try {
    await run()
    await new Promise((resolve) => setTimeout(resolve, 10))
  } finally {
    process.off('unhandledRejection', collect)
    for (const runner of runners) process.on('unhandledRejection', runner)
  }
  return caught
}

it('rejects with the AbortError of a body its fetch already aborted, leaving no unhandled rejection', async () => {
  const abort = new AbortController()
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      // Registered before readEventStream's listener, as fetch registers its own abort first
      abort.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true })
    },
  })
  const caught = await catchUnhandled(async () => {
    const reading = readEventStream(body, () => {}, abort.signal)
    abort.abort()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
  })
  expect(caught).toEqual([])
})

it('still surfaces a cancel that fails with another error', async () => {
  const abort = new AbortController()
  const failure = new Error('cancel failed')
  const body = new ReadableStream<Uint8Array>({
    cancel: () => {
      throw failure
    },
  })
  const caught = await catchUnhandled(async () => {
    const reading = readEventStream(body, () => {}, abort.signal)
    abort.abort()
    await reading
  })
  expect(caught).toEqual([failure])
})
