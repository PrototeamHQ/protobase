import { appPlugin } from '@protobase/workflow-plugins'
import { stepHandlers, type TaskHandler } from '@protobase/workflows'
import { ConnectionError, type PluginMail, type PluginRecords } from '@protobase/workflows/plugin'
import type { FilesRuntime } from '../../files/runtime'
import { pluginFetch, type PluginFetchOptions } from '../plugin-fetch'
import { runFiles } from '../plugin-services'

export type BuiltInStepOptions = PluginFetchOptions & { files?: () => FilesRuntime | undefined; mail?: PluginMail; records?: PluginRecords }

/** A built-in step type as the app runs it: through the plugin interface, with the app's guarded fetch and run files. */
export const builtInStep = (id: string, { files = () => undefined, mail, records = {} as PluginRecords, ...fetch }: BuiltInStepOptions = {}): TaskHandler =>
  stepHandlers([appPlugin], {
    services: (task) => ({ fetch: pluginFetch(fetch), files: runFiles(files, task.runId), mail, records }),
    connection: () => ({ accessToken: () => Promise.reject(new ConnectionError('not_connected', 'none')) }),
  })[id]!
