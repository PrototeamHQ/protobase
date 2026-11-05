import { StepError } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import { cleanName, formatUri, parseUri, type FileRef } from '../files/uri'
import { readLimited } from '../webhooks/table/read-limited'
import type { ScratchFiles } from './scratch-files'

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

/** Keeps bytes at `path` of the run's store, and a copy on the scratch disk when there is one. */
export const putRunBytes = async (store: NonNullable<ReturnType<typeof privateRunStore>>, path: string, bytes: Uint8Array, scratch?: ScratchFiles) => {
  await store.put(path, new Blob([bytes as BlobPart]).stream())
  await scratch?.put(path, bytes)
}

/** The bytes at `path`, up to one more than `limit`: from the scratch disk when it still has them, else the run's store. */
export const readRunBytes = async (store: NonNullable<ReturnType<typeof privateRunStore>>, path: string, limit: number, scratch?: ScratchFiles) => {
  const near = await scratch?.read(path)
  if (near) return near
  const stream = await store.read(path)
  if (!stream) return undefined
  const bytes = await readLimited(new Response(stream), limit + 1)
  if (bytes.length <= limit) await scratch?.put(path, bytes)
  return bytes
}

/**
 * Stores bytes a step of the run got, such as an answer's body, as a file of the run's own, under a name of the
 * runner's choosing: no part of its path comes from the workflow or the answer.
 */
export const storeRunFile = async (files: FilesRuntime | undefined, runId: string, bytes: Uint8Array, name: string, type: string, scratch?: ScratchFiles): Promise<FileValue> => {
  const store = runStore(files)
  const path = `${prefix(runId)}${crypto.randomUUID()}`
  await putRunBytes(store, path, bytes, scratch)
  const clean = cleanName(name)
  return { uri: formatUri({ provider, path, name: clean, size: bytes.length }), name: clean, type, size: bytes.length }
}

/** Whether a value has a file value's shape, all four fields; an object with only a `uri` is other data. */
export const isFileValue = (value: unknown): value is FileValue => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { uri, name, type, size } = value as Partial<Record<keyof FileValue, unknown>>
  return typeof uri === 'string' && typeof name === 'string' && typeof type === 'string' && typeof size === 'number'
}

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

/** The bytes of a file the run stored itself, read up to `runFileLimit`, from the scratch disk first when there is one. */
export const readRunFile = async (files: FilesRuntime | undefined, runId: string, value: unknown, field: string, scratch?: ScratchFiles) => {
  const ref = runFileRef(runId, value, field)
  const bytes = await readRunBytes(runStore(files), ref.path, runFileLimit, scratch)
  if (!bytes) throw new StepError('States.TaskFailed', `${field} names a file that is gone`)
  if (bytes.length > runFileLimit) throw new StepError('States.TaskFailed', `${field} is larger than ${runFileLimit / 1024 / 1024} MiB`)
  return { ref, bytes }
}
