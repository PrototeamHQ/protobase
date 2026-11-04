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

// Every file a run stores is kept under its id, so a step can tell the run's own files from any other.
const prefix = (runId: string) => `workflows/${runId}/`

const noFiles = () => new StepError('States.TaskFailed', `The app keeps no files: workflows store theirs with the "${provider}" file provider`)

/**
 * Stores bytes a step of the run got, such as an answer's body, as a file of the run's own, under a name of the
 * runner's choosing: no part of its path comes from the workflow or the answer.
 */
export const storeRunFile = async (files: FilesRuntime | undefined, runId: string, bytes: Uint8Array, name: string, type: string): Promise<FileValue> => {
  const store = files?.providers[provider]?.store
  if (!store) throw noFiles()
  const path = `${prefix(runId)}${crypto.randomUUID()}`
  await store.put(path, new Blob([bytes as BlobPart]).stream())
  const clean = cleanName(name)
  return { uri: formatUri({ provider, path, name: clean, size: bytes.length }), name: clean, type, size: bytes.length }
}

const isFileValue = (value: unknown): value is FileValue =>
  typeof value === 'object' && value !== null && typeof (value as FileValue).uri === 'string'

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
  const store = files?.providers[provider]?.store
  if (!store) throw noFiles()
  const stream = await store.read(ref.path)
  if (!stream) throw new StepError('States.TaskFailed', `${field} names a file that is gone`)
  const bytes = await readLimited(new Response(stream), runFileLimit + 1)
  if (bytes.length > runFileLimit) throw new StepError('States.TaskFailed', `${field} is larger than ${runFileLimit / 1024 / 1024} MiB`)
  return { ref, bytes }
}
