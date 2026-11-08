import type { PluginFiles, PluginServices } from '@protobase/workflows/plugin'
import type { TaskContext } from '@protobase/workflows'
import type { Deps } from '../deps'
import type { FilesRuntime } from '../files/runtime'
import type { Mailer } from '../mail/mail-message'
import { pluginFetch } from './plugin-fetch'
import { pluginRecords, type SaverRoles } from './plugin-records'
import { readRunFile, storeRunFile } from './run-files'
import type { WorkflowsStorage } from './options'
import { pluginStorage } from './storage/plugin-storage'

export type ServicesInput = { deps: () => Deps; schema: string; roles: SaverRoles; allowPrivateAddresses: boolean; storage?: WorkflowsStorage | undefined }

/** The plugin context's `files`: those of the run alone, in the app's `private` file provider. */
export const runFiles = (files: () => FilesRuntime | undefined, runId: string): PluginFiles => ({
  keep: (bytes, name, type) => storeRunFile(files(), runId, bytes, name, type),
  read: async (value, field) => {
    const { ref, bytes } = await readRunFile(files(), runId, value, field)
    return { name: ref.name, ...(ref.type && { type: ref.type }), bytes }
  },
})

/** What the app gives a plugin's step in a run: the guarded fetch, records as the saver, the run's files, storage as the saver and the mailer. */
export const pluginServices = ({ deps, schema, roles, allowPrivateAddresses, storage }: ServicesInput, mail: Mailer | undefined) => {
  const fetch = pluginFetch({ allowPrivateAddresses })
  return (task: TaskContext): PluginServices => ({
    fetch,
    records: pluginRecords({ deps, schema, roles }, task.runId, task.idempotencyKey),
    files: runFiles(() => deps().files, task.runId),
    storage: pluginStorage({ deps, schema, roles, storage, allowPrivateAddresses }, task.runId),
    mail,
  })
}
