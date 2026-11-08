import { appPlugin } from '@protobase/workflow-plugins'
import { StepError, stepHandlers, type TaskHandler } from '@protobase/workflows'
import { ConnectionError, type PluginMail, type PluginRecords, type PluginStorage } from '@protobase/workflows/plugin'
import type { FilesRuntime } from '../../files/runtime'
import { pluginFetch, type PluginFetchOptions } from '../plugin-fetch'
import { runFiles } from '../plugin-services'

export type BuiltInStepOptions = PluginFetchOptions & { files?: () => FilesRuntime | undefined; mail?: PluginMail; records?: PluginRecords; storage?: (runId: string) => PluginStorage }

const noStorage: PluginStorage = {
  put: () => Promise.reject(new StepError('Storage.NotFound', 'No storage configuration this workflow may use')),
  open: () => Promise.reject(new StepError('Storage.NotFound', 'No storage configuration this workflow may use')),
  read: () => Promise.reject(new StepError('Storage.NotFound', 'No storage configuration this workflow may use')),
}

/** A built-in step type as the app runs it: through the plugin interface, with the app's guarded fetch, run files and the storage given. */
export const builtInStep = (id: string, { files = () => undefined, mail, records = {} as PluginRecords, storage = () => noStorage, ...fetch }: BuiltInStepOptions = {}): TaskHandler =>
  stepHandlers([appPlugin], {
    services: (task) => ({ fetch: pluginFetch(fetch), files: runFiles(files, task.runId), storage: storage(task.runId), mail, records }),
    connection: () => ({ accessToken: () => Promise.reject(new ConnectionError('not_connected', 'none')) }),
  })[id]!
