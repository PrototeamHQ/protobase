import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Db } from '../db/connection'

const batchSize = 2000

function* batches(rows: Iterable<string>) {
  let batch: string[] = []
  for (const line of rows) {
    batch.push(line)
    if (batch.length < batchSize) continue
    yield batch.join('')
    batch = []
  }
  if (batch.length > 0) yield batch.join('')
}

// Streams COPY text-format rows into `schema.table (columns)`.
export const copyRows = async (sql: Db, target: string, rows: Iterable<string>) => {
  const writable = await sql.unsafe(`copy ${target} from stdin`).writable()
  await pipeline(Readable.from(batches(rows)), writable)
}
