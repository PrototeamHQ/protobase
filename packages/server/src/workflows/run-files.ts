import { isFileValue } from '@protobase/workflows/plugin'
import { StepError } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import { cleanName, formatUri, parseUri, type FileRef } from '../files/uri'
import { readLimited } from '../webhooks/table/read-limited'

/** The most bytes of one file a workflow stores or reads, as the `http` step reads at most. */
export const runFileLimit = 10 * 1024 * 1024

/** A file value: the app's handle to stored bytes, the object its API returns for a file field. */
export type FileValue = { uri: string; name: string; type: string; size: number }

/** The provider a run's files are kept in. */
const provider = 'private'

/** The folder of a run's files: every file a run stores is kept under its id, so a step can tell the run's own from any other. */
export const runFolder = (runId: string) => `workflows/${runId}/`
const prefix = runFolder

/** The store of runs' files, the private provider's, or `undefined` when the app has none or serves it to anyone. */
export const privateRunStore = (files: FilesRuntime | undefined) => {
  const kept = files?.providers[provider]
  return kept && !kept.public ? kept.store : undefined
}

// The store of the run's files, refused when the provider serves its files to anyone: a run's files are its own.
const runStore = (files: FilesRuntime | undefined) => {
  const kept = files?.providers[provider]
  if (!kept) throw new StepError('States.TaskFailed', `The app keeps no files: workflows store theirs with the "${provider}" file provider`)
  if (kept.public) throw new StepError('States.TaskFailed', `The "${provider}" file provider is public, so workflows keep no files in it: anyone could read them`)
  return kept.store
}

/**
 * Stores bytes a step of the run got, such as an answer's body, as a file of the run's own, under a name of the
 * runner's choosing: no part of its path comes from the workflow or the answer. At most `runFileLimit` bytes.
 */
export const storeRunFile = async (files: FilesRuntime | undefined, runId: string, bytes: Uint8Array, name: string, type: string): Promise<FileValue> => {
  const store = runStore(files)
  // A file larger than a run reads back would be kept for nothing.
  if (bytes.length > runFileLimit) throw new StepError('States.TaskFailed', `${cleanName(name)} is larger than ${runFileLimit / 1024 / 1024} MiB, the most a run keeps of one file`)
  const path = `${prefix(runId)}${crypto.randomUUID()}`
  await store.put(path, new Blob([bytes as BlobPart]).stream())
  const clean = cleanName(name)
  return { uri: formatUri({ provider, path, name: clean, size: bytes.length }), name: clean, type, size: bytes.length }
}

export { isFileValue }

/**
 * The file a file value names, when it is one the run stored itself; a step fails on any other, so a workflow cannot
 * mail, send or attach a file of the app's by naming its URI.
 */
export const runFileRef = (runId: string, value: unknown, field: string): FileRef & { type?: string } => {
  const ref = isFileValue(value) ? parseUri(value.uri) : undefined
  if (!ref) throw new StepError('States.TaskFailed', `${field} is not a file value ({ uri, name, type, size })`)
  if (ref.provider !== provider || !ref.path.startsWith(prefix(runId))) throw new StepError('States.TaskFailed', `${field} is not a file this run stored; a step takes only the files of its own run`)
  const type = (value as FileValue).type
  return { ...ref, ...(typeof type === 'string' && { type }) }
}

/** The bytes of a file the run stored itself, read up to `runFileLimit`. */
export const readRunFile = async (files: FilesRuntime | undefined, runId: string, value: unknown, field: string) => {
  const ref = runFileRef(runId, value, field)
  const store = runStore(files)
  const stream = await store.read(ref.path)
  if (!stream) throw new StepError('States.TaskFailed', `${field} names a file that is gone`)
  const bytes = await readLimited(new Response(stream), runFileLimit + 1)
  if (bytes.length > runFileLimit) throw new StepError('States.TaskFailed', `${field} is larger than ${runFileLimit / 1024 / 1024} MiB`)
  return { ref, bytes }
}

/** Removes a file a run stored, as when the run it was kept for turned out to be started already. */
export const removeRunFile = async (files: FilesRuntime | undefined, value: FileValue) => {
  const ref = parseUri(value.uri)
  if (!ref) throw new Error(`${value.uri} is not a file URI`)
  await runStore(files).delete(ref.path)
}
