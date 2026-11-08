import { fetchMaxBytes, isFileValue, isStoredFile, StepError, type StepContext, type StepType } from '@protobase/workflows/plugin'

const storedFileSchema = {
  type: 'object',
  required: ['configuration', 'path', 'name', 'type', 'size'],
  description: 'a stored file, { configuration, node?, path, name, type, size }, as a storage step or the http step gave it',
  properties: { configuration: { type: 'string' }, node: { type: 'string' }, path: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' } },
}

const configurationSchema = { type: 'string', description: 'the name of a storage configuration, such as "archive"' }
const pathSchema = { type: 'string', description: 'where in the configuration, such as "invoices/2026/1234.pdf"; default a path of this step in this run' }

/**
 * The path a store without one writes to: the run's, then a digest of the step's idempotency key, so a retry of the
 * step after a crash, before its result was saved, replaces the same file instead of leaving a second one.
 */
export const stepPath = async ({ runId, idempotencyKey }: Pick<StepContext, 'runId' | 'idempotencyKey'>) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idempotencyKey)))
  return `runs/${runId}/${[...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

const invalid = (reason: string) => new StepError('Storage.InvalidArguments', reason)

// The bytes of a stream up to `limit`, stopping as soon as it passes it, so a large file is never held whole.
const readUpTo = async (body: ReadableStream<Uint8Array>, limit: number) => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length
    if (size > limit) {
      await reader.cancel()
      return undefined
    }
    chunks.push(read.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

// What a put stores: a file of the run, or a stored file streamed from its configuration.
const source = async (file: unknown, { files, storage }: StepContext) => {
  if (isFileValue(file)) {
    const kept = await files.read(file, 'file')
    return { name: kept.name, type: kept.type ?? 'application/octet-stream', body: new Blob([kept.bytes as BlobPart]).stream() }
  }
  if (isStoredFile(file)) {
    const { file: stored, body } = await storage.read(file, 'file')
    return { name: stored.name, type: stored.type, body }
  }
  throw invalid('file is a file value of the run or a stored file')
}

const put = async (context: StepContext) => {
  const { input, storage } = context
  if (typeof input.configuration !== 'string') throw invalid('configuration is the name of a storage configuration')
  if (input.path !== undefined && typeof input.path !== 'string') throw invalid('path is text')
  const { name, type, body } = await source(input.file, context)
  return storage.put(input.configuration, (input.path as string | undefined) ?? (await stepPath(context)), body, { name, type })
}

const get = async ({ input, storage, files }: StepContext) => {
  const { file, body } = await storage.read(input.file, 'file')
  const bytes = await readUpTo(body, fetchMaxBytes)
  if (!bytes) throw new StepError('Storage.TooLarge', `${file.name} is larger than ${fetchMaxBytes / 1024 / 1024} MiB, the most a run keeps of one file; pass the stored file on instead`)
  return files.keep(bytes, file.name, file.type)
}

const errors = {
  NotFound: 'no storage configuration of that name this workflow may use, or the file is gone from it',
  InvalidArguments: 'an argument has the wrong type or a path that leaves its configuration, named in the cause',
  Unavailable: 'the configuration cannot be used as it is, such as an S3 one without keys, named in the cause',
  Failed: 'the store failed; the cause names its error code',
  Full: 'the store has no room left',
}

/** `app:storage.put` and `app:storage.get`: files in the app's storage configurations, which a workflow names. */
export const storageSteps: Record<string, StepType> = {
  'storage.put': {
    label: 'Store a file',
    description: 'Stores a file of the run, or a stored file, in a storage configuration, replacing what is at its path.',
    errorPrefix: 'Storage',
    input: {
      type: 'object',
      required: ['configuration', 'file'],
      properties: { configuration: configurationSchema, path: pathSchema, file: { description: 'a file value of the run, or a stored file' } },
    },
    output: storedFileSchema,
    errors,
    writes: true,
    run: put,
  },
  'storage.get': {
    label: 'Read a stored file',
    description: 'Reads a stored file back as a file of the run, up to 10 MiB, for steps that take one, such as mail attachments.',
    errorPrefix: 'Storage',
    input: { type: 'object', required: ['file'], properties: { file: storedFileSchema } },
    output: { type: 'object', description: 'a file value of the run, { uri, name, type, size }' },
    errors: { ...errors, TooLarge: 'the file is larger than 10 MiB' },
    writes: false,
    run: get,
  },
}
