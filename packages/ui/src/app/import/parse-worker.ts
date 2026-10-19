/// <reference lib="webworker" />
import type { ParseReply, ParseRequest } from './parse-messages'
import { setFallbackLocale } from '../../locale/active-locale'
import { sheetNames, sheetRows } from './sheet-file'

// Reads a chosen file off the main thread: its sheet names, or its rows a chunk at a time, the next chunk once the
// page asks for it, so a large file is never read faster than the page uses it.

const scope = self as unknown as DedicatedWorkerGlobalScope
const reply = (message: ParseReply) => scope.postMessage(message)
let next: (() => void) | undefined

const read = async (request: Extract<ParseRequest, { type: 'read' }>) => {
  let chunk = []
  for await (const row of sheetRows(request.file, request.sheet)) {
    chunk.push(row)
    if (chunk.length < request.chunk) continue
    const asked = new Promise<void>((resolve) => (next = resolve))
    reply({ type: 'rows', rows: chunk })
    chunk = []
    await asked
  }
  reply({ type: 'rows', rows: chunk })
  reply({ type: 'end' })
}

const handle = async (request: ParseRequest) => {
  if (request.type === 'next') return next?.()
  setFallbackLocale(request.locale)
  if (request.type === 'sheets') return reply({ type: 'sheets', sheets: await sheetNames(request.file) })
  await read(request)
}

scope.onmessage = (event: MessageEvent<ParseRequest>) => {
  handle(event.data).catch((error: unknown) => reply({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
}
