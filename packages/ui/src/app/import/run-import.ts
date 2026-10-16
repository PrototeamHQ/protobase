import { isApiError, type BatchOp, type Client } from '@protobase/client'
import { fieldLabel } from './mapping'
import { prepareRows, type ImportContext, type ImportPlan, type PreparedRow } from './prepare-rows'
import { cellText, type SheetCell, type SheetRow } from './sheet-cell'
import type { SheetSource } from './sheet-source'

/** How many data rows the mapping step shows under each column. */
const sampleRows = 5
/** How many rows of the check the preview shows. */
const previewRows = 5
/** Rows per batch write: each batch is one transaction. */
export const batchRows = 100

/** The file's header row as text, and its first data rows. */
export type SheetHead = { headers: string[]; sample: SheetRow[] }

/** The header and the first rows of a sheet, reading no further than its first chunk. */
export const readHead = async (source: SheetSource, sheet: string | undefined): Promise<SheetHead> => {
  const chunks = source.rows(sheet)
  const { value: first = [] } = await chunks.next()
  await chunks.return(undefined)
  const [header, ...rows] = first
  return { headers: (header?.cells ?? []).map(cellText), sample: rows.slice(0, sampleRows) }
}

// The data rows of a sheet, chunk by chunk, without its header row
async function* dataRows(source: SheetSource, sheet: string | undefined) {
  let header = true
  for await (const chunk of source.rows(sheet)) {
    yield header ? chunk.slice(1) : chunk
    header = false
  }
}

/** A row the import did not write, with the line it has in the file and why. */
export type FailedRow = { line: number; cells: SheetCell[]; problems: string[] }

/** What the check found: how many rows would create or update a record, the rows with problems, and the first rows as they would be written. */
export type ImportCheck = { rows: number; creates: number; updates: number; problems: FailedRow[]; preview: PreparedRow[] }

/** Reads the whole file and prepares every row as the import would, writing nothing; `onProgress` gets the rows read so far. */
export const checkImport = async (source: SheetSource, sheet: string | undefined, plan: ImportPlan, context: ImportContext, onProgress: (rows: number) => void, signal?: AbortSignal) => {
  const check: ImportCheck = { rows: 0, creates: 0, updates: 0, problems: [], preview: [] }
  for await (const chunk of dataRows(source, sheet)) {
    signal?.throwIfAborted()
    for (const row of await prepareRows(chunk, plan, context)) {
      check.rows++
      if (check.preview.length < previewRows) check.preview.push(row)
      if (row.op?.op === 'create') check.creates++
      else if (row.op?.op === 'update') check.updates++
      else check.problems.push({ line: row.line, cells: row.cells, problems: row.problems })
    }
    onProgress(check.rows)
  }
  return check
}

/** Where an import stands: what it wrote, skipped for problems and the server refused, and the rows it did not write. */
export type ImportProgress = { created: number; updated: number; skipped: number; failed: number; notWritten: FailedRow[] }

// Why the server refused a write: its field errors under the fields' labels, else its message
const refusal = (error: Error, context: ImportContext) => {
  if (!isApiError(error)) return [error.message]
  const fields = error.errors.filter((entry) => entry.field)
  if (fields.length === 0) return [error.message]
  return fields.map((entry) => `${fieldLabel(context.views[context.model.name], entry.field!)}: ${entry.message}`)
}

export type RunOptions = {
  client: Client
  /** Called after every batch, with the counts so far. */
  onProgress: (progress: ImportProgress) => void
  /** Asked before every batch: true stops the import there, keeping what earlier batches wrote. */
  cancelled: () => boolean
}

/**
 * Writes the file's rows in batches of `batchRows`, each batch one transaction through `POST :batchWrite`, with the
 * same validation and access as single writes. A row the server refuses is set aside with the reason, and the rest of
 * its batch is sent again, so every row that can be written is. Rows with problems are skipped. Answers `cancelled`
 * when stopped between batches; an error other than a refused row stops the import and is thrown.
 */
export const runImport = async (source: SheetSource, sheet: string | undefined, plan: ImportPlan, context: ImportContext, { client, onProgress, cancelled }: RunOptions) => {
  const progress: ImportProgress = { created: 0, updated: 0, skipped: 0, failed: 0, notWritten: [] }

  const write = async (rows: PreparedRow[]) => {
    const pending = [...rows]
    while (pending.length > 0) {
      const ops = pending.map((row) => row.op!) as BatchOp[]
      try {
        const { results } = await client.batchWrite(ops)
        for (const result of results) {
          if (result.op === 'create') progress.created++
          else if (result.op === 'update') progress.updated++
        }
        return
      } catch (error) {
        const index = isApiError(error) ? error.operation : undefined
        if (index === undefined || !pending[index]) throw error
        const [refused] = pending.splice(index, 1)
        progress.failed++
        progress.notWritten.push({ line: refused!.line, cells: refused!.cells, problems: refusal(error as Error, context) })
      }
    }
  }

  let queue: PreparedRow[] = []
  const flush = async (all: boolean) => {
    while (queue.length >= batchRows || (all && queue.length > 0)) {
      if (cancelled()) return false
      await write(queue.splice(0, batchRows))
      onProgress({ ...progress })
    }
    return true
  }

  for await (const chunk of dataRows(source, sheet)) {
    for (const row of await prepareRows(chunk, plan, context)) {
      if (row.op) queue.push(row)
      else {
        progress.skipped++
        progress.notWritten.push({ line: row.line, cells: row.cells, problems: row.problems })
      }
    }
    if (!(await flush(false))) return { ...progress, cancelled: true }
  }
  if (!(await flush(true))) return { ...progress, cancelled: true }
  return { ...progress, cancelled: false }
}
