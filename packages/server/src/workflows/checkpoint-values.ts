import { limits } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import { privateRunStore, putRunBytes, readRunBytes, runFolder } from './run-files'
import type { ScratchFiles } from './scratch-files'

/** The values a checkpoint keeps: the next state's input (or the scope's output) and the scope's variables. */
export type Values = { value: unknown; variables: Record<string, unknown> }

/** Where a checkpoint's values are kept: in its row, or, when large, as a file of the run whose path the row holds. */
export type CheckpointValues = { keep(runId: string, values: Values): Promise<Values | { blob: string }>; read(blob: string): Promise<Values> }

/** Values larger than this as JSON go to a file of the run, when the app keeps files, rather than into the row. */
export const inlineValueBytes = 16 * 1024

// Each value is at most `limits.valueBytes`, and a scope keeps a few: the file of all of them is read up to this.
const blobLimit = 64 * limits.valueBytes

/**
 * Keeps a large checkpoint's values as a JSON file of the run in the private file provider, and a copy on the scratch
 * disk, read first; the row keeps only its path. An app with no private provider keeps them in the row.
 */
export const checkpointValues = (files: () => FilesRuntime | undefined, scratch?: ScratchFiles): CheckpointValues => ({
  keep: async (runId, values) => {
    const store = privateRunStore(files())
    const bytes = new TextEncoder().encode(JSON.stringify(values))
    if (!store || bytes.length <= inlineValueBytes) return values
    const blob = `${runFolder(runId)}checkpoints/${crypto.randomUUID()}.json`
    await putRunBytes(store, blob, bytes, scratch)
    return { blob }
  },
  read: async (blob) => {
    const store = privateRunStore(files())
    if (!store) throw new Error(`A checkpoint keeps its values in ${blob}, but the app has no private file provider to read it from`)
    const bytes = await readRunBytes(store, blob, blobLimit, scratch)
    if (!bytes) throw new Error(`A checkpoint's values are gone from ${blob} in the private file provider`)
    return JSON.parse(new TextDecoder().decode(bytes)) as Values
  },
})
