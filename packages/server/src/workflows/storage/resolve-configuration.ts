import { storageNamePattern } from '@protobase/schema/internal'
import { StepError } from '@protobase/workflows'
import type { DecryptField } from '../../encryption/decrypt-field-types'
import { UnreadableValue } from '../../encryption/envelope-open'
import { fileProviderOf } from '../../files/provider-settings'
import type { FileProvider, FileStore } from '../../files/store'
import { HttpProblem } from '../../problem'
import type { Row, Session } from '../../types'
import type { Resolve } from '../../webhooks/table/pinned-request'
import type { WorkflowsStorage } from '../options'
import { configurationProblem } from './configuration-rules'
import { endpointProblem } from './endpoint-check'
import { localFolder } from './local-folder'

export const storageResource = 'storage_configurations'

/** Where a configuration's records and keys come from, and how its store is made, so tests can give their own. */
export type ConfigurationSources = {
  storage: WorkflowsStorage | undefined
  /** The configurations named `name` the session may read, through the API. */
  list: (session: Session, name: string) => Promise<Row[]>
  /** Opens a configuration's encrypted field for the session's run, published as a reveal. */
  decrypt: (session: Session, runId: string) => DecryptField
  /** The folders of the app's file providers on local disk, which the storage root keeps out of. */
  providerDirs: () => string[]
  allowPrivateAddresses: boolean
  /** The server that holds a local configuration's files. */
  node: string
  resolve?: Resolve
  provider?: typeof fileProviderOf
}

/** A configuration's store, and the server that holds its files when it is local. */
export type ResolvedStore = { store: FileStore; node?: string }

// One error for a configuration that is not there, one the editor may not read and another tenant's, so a step learns
// nothing of what it may not use.
const notFound = (name: unknown) => new StepError('Storage.NotFound', `No storage configuration ${JSON.stringify(String(name).slice(0, 63))} this workflow may use`)

const unavailable = (name: string, why: string) => new StepError('Storage.Unavailable', `The storage configuration "${name}" cannot be used: ${why}`)

const codeOf = (error: unknown) => (error instanceof Error ? (error as { code?: unknown }).code : undefined)

/**
 * A store's failure as the step's error: its code alone, as a file system or the S3 API names it, never its message,
 * which can hold the folder or the bucket's answer. A full store is `Storage.Full`; any other error is rethrown.
 */
export const storeFailed = (error: unknown): never => {
  if (error instanceof HttpProblem && error.slug === 'storage-full') throw new StepError('Storage.Full', 'The storage configuration has no room left for this file')
  const code = codeOf(error)
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(code)) throw new StepError('Storage.Failed', `The store failed with ${code}`)
  throw error
}

// A refusal of the API, such as a role without `storage_configurations.read`, is a configuration the step cannot see.
const listed = async (sources: ConfigurationSources, session: Session, name: string) => {
  try {
    return await sources.list(session, name)
  } catch (error) {
    if (error instanceof HttpProblem && (error.status === 401 || error.status === 403 || error.status === 404)) throw notFound(name)
    throw error
  }
}

// A key that does not open, as after its encryption key changed, makes no request at all.
const opened = async (open: DecryptField, name: string, id: string, field: string) => {
  try {
    return await open(storageResource, id, field)
  } catch (error) {
    if (error instanceof UnreadableValue) throw unavailable(name, 'its access keys cannot be decrypted; set them again')
    throw error
  }
}

const s3Provider = async (sources: ConfigurationSources, session: Session, runId: string, name: string, row: Row): Promise<FileProvider> => {
  const endpoint = row.endpoint ?? undefined
  if (typeof endpoint === 'string') {
    const problem = await endpointProblem(endpoint, { endpoints: sources.storage!.endpoints, allowPrivateAddresses: sources.allowPrivateAddresses, ...(sources.resolve && { resolve: sources.resolve }) })
    if (problem) throw unavailable(name, problem)
  }
  const open = sources.decrypt(session, runId)
  const accessKeyId = await opened(open, name, String(row.id), 'access_key_id')
  const secretAccessKey = await opened(open, name, String(row.id), 'secret_access_key')
  // Without keys of its own the S3 client would sign with the operator's from the environment.
  if (!accessKeyId || !secretAccessKey) throw unavailable(name, 'it has no access keys; set access_key_id and secret_access_key')
  const region = row.region ?? undefined
  return (sources.provider ?? fileProviderOf)(name, {
    kind: 's3',
    bucket: String(row.bucket),
    ...(typeof region === 'string' && { region }),
    ...(typeof endpoint === 'string' && { endpoint }),
    accessKeyId,
    secretAccessKey,
  })
}

/**
 * The store of the configuration named `name`, as the session of the run's last editor may read it now, read anew on
 * every call so a change takes effect at the next step. A local one is a folder under the storage root; an S3 one has
 * its endpoint checked again and its keys opened only after the read was allowed. With storage off, or a name the
 * session cannot read, it fails as `Storage.NotFound`; it never falls back to another store.
 */
export const resolveConfiguration = (sources: ConfigurationSources) => async (session: Session, runId: string, name: unknown): Promise<ResolvedStore> => {
  if (!sources.storage || typeof name !== 'string' || !storageNamePattern.test(name)) throw notFound(name)
  const row = (await listed(sources, session, name)).find((found) => found.name === name)
  if (!row) throw notFound(name)
  const problem = configurationProblem(row, sources.storage)
  if (problem) throw unavailable(name, problem.message)
  if (row.kind === 'local') {
    const dir = await localFolder(sources.storage.root!, row.dir, sources.providerDirs())
    return { store: (sources.provider ?? fileProviderOf)(name, { kind: 'local', dir }).store, node: sources.node }
  }
  return { store: (await s3Provider(sources, session, runId, name, row)).store }
}
