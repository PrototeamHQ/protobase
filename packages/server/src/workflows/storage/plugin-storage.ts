import { hostname } from 'node:os'
import { storageNamePattern } from '@protobase/schema/internal'
import { StepError } from '@protobase/workflows'
import { isStoredFile, type PluginStorage, type StorageTarget } from '@protobase/workflows/plugin'
import { assistantRecords } from '../../assistant/records'
import type { Deps } from '../../deps'
import { fieldDecrypter } from '../../encryption/decrypt-field'
import { cleanName } from '../../files/uri'
import type { Session } from '../../types'
import type { WorkflowsStorage } from '../options'
import { runSession, type RecordsInput } from '../plugin-records'
import { resolveConfiguration, storageResource, storeFailed, type ConfigurationSources } from './resolve-configuration'
import { isStoredPath } from './stored-path'

export type StorageInput = RecordsInput & { storage: WorkflowsStorage | undefined; allowPrivateAddresses: boolean }

/** The sources of the app's own configurations: its API as the run's last editor, its encrypted fields and its file providers. */
export const appSources = ({ deps, storage, allowPrivateAddresses }: StorageInput): ConfigurationSources => ({
  storage,
  list: async (session, name) => (await assistantRecords(deps(), session).list(storageResource, { filter: `name = "${name}"`, page_size: 2 })).items,
  decrypt: (session, runId) => fieldDecrypter(deps())({ function: `workflow run ${runId}`, actor: { id: session.user.id, roles: session.user.roles ?? [] }, origin: {} }),
  providerDirs: () => Object.values(deps().files?.providers ?? {}).flatMap((provider) => (provider.localDir === undefined ? [] : [provider.localDir])),
  allowPrivateAddresses,
  node: hostname(),
  environment: globalThis.process?.env ?? {},
})

const invalid = (reason: string) => new StepError('Storage.InvalidArguments', reason)

// A file's bytes, failing through `storeFailed` when the store fails partway, such as with EIO, as when it fails before.
const failingAsStore = (body: ReadableStream<Uint8Array>) => {
  const reader = body.getReader()
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const read = await reader.read().catch(storeFailed)
      if (read.done) controller.close()
      else controller.enqueue(read.value)
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

// A body the store never started reading is cancelled, so its source, such as an answer's connection, is let go; one the
// store did start reading is cancelled by the store as it fails.
const cancelling = (body: ReadableStream<Uint8Array>) => async (error: unknown): Promise<never> => {
  if (!body.locked) await body.cancel()
  throw error
}

/** The session of the run's last editor; a version no one saved, or whose editor holds no role now, may use no configuration at all. */
export const editorSession = async (session: () => Promise<Session>): Promise<Session> => {
  try {
    return await session()
  } catch (error) {
    if (error instanceof StepError && error.error === 'Records.Refused') throw new StepError('Storage.NotFound', "The workflow's last editor may use no storage configuration")
    throw error
  }
}

/**
 * The plugin context's `storage` for one run: each call reads its configuration anew as `session`, the run's last
 * editor. A path, and a stored file a step is given, which the workflow could have written by hand, are checked before
 * any store is touched; a file that is gone fails as `Storage.NotFound`.
 */
export const storageService = (session: () => Promise<Session>, runId: string, sources: ConfigurationSources): PluginStorage => {
  const resolve = resolveConfiguration(sources)
  const open = async (configuration: string) => resolve(await editorSession(session), runId, configuration)
  const target = async (configuration: string, path: string): Promise<StorageTarget> => {
    if (!isStoredPath(path)) throw invalid('path is relative: letters, digits, ".", "_" and "-" in segments split by "/", none starting with "."')
    const { store, node } = await open(configuration)
    return {
      put: async (body, file) => {
        const { size } = await store.put(path, body).catch(cancelling(body)).catch(storeFailed)
        return { configuration, ...(node !== undefined && { node }), path, name: cleanName(file.name), type: file.type, size }
      },
    }
  }
  return {
    open: target,
    put: async (configuration, path, body, file) => (await target(configuration, path).catch(cancelling(body))).put(body, file),
    read: async (value, field) => {
      if (!isStoredFile(value) || !storageNamePattern.test(value.configuration) || !isStoredPath(value.path)) throw invalid(`${field} is not a stored file ({ configuration, path, name, type, size })`)
      const { store } = await open(value.configuration)
      const body = await store.read(value.path).catch(storeFailed)
      if (!body) throw new StepError('Storage.NotFound', `${field} names a file that is gone from "${value.configuration}"`)
      return { file: value, body: failingAsStore(body) }
    },
  }
}

/** The app's `storage` for one run, as the run's last editor with the roles they hold now. */
export const pluginStorage = (input: StorageInput, runId: string) => storageService(() => runSession(input, runId), runId, appSources(input))
