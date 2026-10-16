import type { ParseReply, ParseRequest } from './parse-messages'
import type { SheetRow } from './sheet-cell'

/** A chosen file as an import reads it: its sheet names, and its rows (the header first) in chunks. */
export type SheetSource = {
  sheets: () => Promise<string[]>
  rows: (sheet: string | undefined) => AsyncGenerator<SheetRow[]>
}

/** How many rows the worker sends at a time. */
const chunkRows = 500

// A parse worker, with its replies taken one at a time
const startWorker = () => {
  const worker = new Worker(new URL('./parse-worker.ts', import.meta.url), { type: 'module' })
  const replies: ParseReply[] = []
  let waiting: ((reply: ParseReply) => void) | undefined
  worker.onmessage = (event: MessageEvent<ParseReply>) => {
    if (waiting) {
      const resolve = waiting
      waiting = undefined
      resolve(event.data)
    } else replies.push(event.data)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    const failed: ParseReply = { type: 'error', message: 'The file could not be read' }
    if (waiting) waiting(failed)
    else replies.push(failed)
  }
  const send = (request: ParseRequest) => worker.postMessage(request)
  const receive = () => (replies.length > 0 ? Promise.resolve(replies.shift()!) : new Promise<ParseReply>((resolve) => (waiting = resolve)))
  return { send, receive, stop: () => worker.terminate() }
}

/** The file read by a Web Worker, so parsing never holds up the page; each read has a worker of its own. */
export const workerSheetSource = (file: File): SheetSource => ({
  sheets: async () => {
    const worker = startWorker()
    try {
      worker.send({ type: 'sheets', file })
      const reply = await worker.receive()
      if (reply.type === 'error') throw new Error(reply.message)
      if (reply.type !== 'sheets') throw new Error(`The parse worker answered ${reply.type} to a request for sheets`)
      return reply.sheets
    } finally {
      worker.stop()
    }
  },
  rows: async function* (sheet) {
    const worker = startWorker()
    try {
      worker.send({ type: 'read', file, sheet, chunk: chunkRows })
      for (;;) {
        const reply = await worker.receive()
        if (reply.type === 'error') throw new Error(reply.message)
        if (reply.type === 'end') return
        if (reply.type !== 'rows') throw new Error(`The parse worker answered ${reply.type} to a read`)
        yield reply.rows
        worker.send({ type: 'next' })
      }
    } finally {
      worker.stop()
    }
  },
})

/** Rows already in memory as a source, for tests and stories. */
export const memorySheetSource = (rows: SheetRow[], sheets: string[] = []): SheetSource => ({
  sheets: async () => sheets,
  rows: async function* () {
    for (let at = 0; at < rows.length; at += chunkRows) yield rows.slice(at, at + chunkRows)
  },
})
