import type { Client } from '@protobase/client'
import type { ExportPlan } from './builder'
import type { BuilderPort } from './builder-port'
import type { ExportSink } from './sink'

/** The most rows one list call answers, so an export makes as few calls as it can. */
export const exportPageSize = 500

export type ExportRun = {
  client: Pick<Client, 'search'>
  resource: string
  /** Read one after the other: the list's filter, or the selected records' keys in groups. */
  filters: string[]
  orderBy: string
  plan: ExportPlan
  /** The relations to name in the same answers, as a list's `labels`. */
  labels: Record<string, string>
  /** The most rows the file holds. */
  limit: number
  port: BuilderPort
  sink: ExportSink
  signal: AbortSignal
  onProgress: (rows: number) => void
}

/** What an export wrote: its rows, and whether more matched than its limit let in. */
export type ExportResult = { rows: number; truncated: boolean }

const aborted = () => new DOMException('The export was cancelled', 'AbortError')

/**
 * Reads the rows through the list API, page by page with its page tokens, and has the port build the file from each;
 * each piece is written to the sink as it is built, so only a page is held at a time. A cancel stops at the next page
 * and discards what was written.
 */
export const runExport = async ({ client, resource, filters, orderBy, plan, labels, limit, port, sink, signal, onProgress }: ExportRun): Promise<ExportResult> => {
  const fields = plan.columns.map((column) => column.name)
  let rows = 0
  try {
    await sink.write(await port.send({ kind: 'start', plan }))
    for (const [index, filter] of filters.entries()) {
      let pageToken = ''
      do {
        const page = await client.search(resource, { filter, orderBy, pageSize: exportPageSize, pageToken, fields, labels })
        if (signal.aborted) throw aborted()
        const records = page.items.slice(0, limit - rows)
        await sink.write(await port.send({ kind: 'page', records, labels: page.labels ?? {} }))
        rows += records.length
        onProgress(rows)
        pageToken = page.nextPageToken
        if (rows >= limit) {
          await finish(port, sink)
          return { rows, truncated: records.length < page.items.length || pageToken !== '' || index + 1 < filters.length }
        }
      } while (pageToken !== '')
    }
    await finish(port, sink)
    return { rows, truncated: false }
  } catch (error) {
    await sink.abort()
    throw error
  } finally {
    port.close()
  }
}

const finish = async (port: BuilderPort, sink: ExportSink) => {
  await sink.write(await port.send({ kind: 'finish' }))
  await sink.close()
}
