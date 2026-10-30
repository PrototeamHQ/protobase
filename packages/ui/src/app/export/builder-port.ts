import type { RelatedLabels } from '@protobase/client'
import type { Locale } from '@protobase/schema/internal'
import { createExportBuilder, type ExportPlan, type ExportRecord } from './builder'
import { text } from './messages'

/** What the page sends the worker that builds a file, one message after the other. */
export type ToBuilder = { kind: 'start'; plan: ExportPlan; locale: Locale } | { kind: 'page'; records: ExportRecord[]; labels: RelatedLabels } | { kind: 'finish' }

/** The worker's answer to each message: the bytes of the file it made from it, which may be none. */
export type FromBuilder = { bytes: Uint8Array }

/** Builds a file from messages, each answered with the bytes it adds to the file. */
export type BuilderPort = { send: (message: ToBuilder) => Promise<Uint8Array>; close: () => void }

const joined = (chunks: Uint8Array[]) => {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** Handles one message at a time, as the worker does, returning the bytes it made; used by the worker and by tests. */
export const createBuilderHandler = () => {
  let builder: ReturnType<typeof createExportBuilder> | undefined
  let chunks: Uint8Array[] = []
  return (message: ToBuilder) => {
    if (message.kind === 'start') builder = createExportBuilder(message.plan, (chunk) => chunks.push(chunk))
    else if (!builder) throw new Error('The export was not started')
    else if (message.kind === 'page') builder.page(message.records, message.labels)
    else builder.finish()
    const bytes = joined(chunks)
    chunks = []
    return bytes
  }
}

/** A port that builds on the page itself, for tests and stories. */
export const createInlinePort = (): BuilderPort => {
  const handle = createBuilderHandler()
  return { send: async (message) => handle(message), close: () => undefined }
}

/**
 * A port to a Web Worker that builds the file, so compressing it never holds up the page. The worker answers messages
 * in the order they came; an error in it fails every message still waiting.
 */
export const createWorkerPort = (): BuilderPort => {
  const worker = new Worker(new URL('./export-worker.ts', import.meta.url), { type: 'module', name: 'protobase-export' })
  const waiting: Array<{ resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }> = []
  worker.onmessage = (event: MessageEvent<FromBuilder>) => waiting.shift()?.resolve(event.data.bytes)
  worker.onerror = (event) => {
    event.preventDefault()
    const error = new Error(text('couldNotBuild', { message: event.message }))
    for (const entry of waiting.splice(0)) entry.reject(error)
  }
  return {
    send: (message) => new Promise((resolve, reject) => {
      waiting.push({ resolve, reject })
      worker.postMessage(message)
    }),
    close: () => worker.terminate(),
  }
}
